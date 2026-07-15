import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { parseFeedXml } from "@mewmo/content";
import { withTimeout } from "@mewmo/queue";

import { fetchClipFromUrl } from "./clip-fetch";
import { normalizeFeedEntryContent } from "./feed-content";

export const DEFAULT_FEED_FETCH_LIMIT = 10;

interface FeedRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
  favicon?: string | null;
}

interface FeedFetchPrisma {
  feed: {
    findFirst(args: unknown): Promise<FeedRecord | null>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface FeedEntryRepository {
  upsertByFeedUrl(
    userId: string,
    input: {
      feedId: string;
      title: string;
      url: string;
      content: string;
      summary?: string | undefined;
      coverImage?: string | undefined;
      excerpt?: string | undefined;
      sourceName?: string | undefined;
      author?: string | undefined;
      publishedAt?: Date | undefined;
    },
  ): Promise<{ created: boolean; entry: unknown }>;
}

interface FetchAndStoreFeedDeps {
  prisma?: FeedFetchPrisma;
  entryRepository?: FeedEntryRepository;
  fetchFeed?: typeof fetch;
  fetchEntryPage?: typeof fetchClipFromUrl;
  now?: () => Date;
  limit?: number;
  allowSuccessfulRefresh?: boolean;
  claimStatuses?: string[];
  allowStaleTakeover?: boolean;
}

export interface FeedFetchResult {
  status: "ok" | "skipped" | "partial" | "error";
  fetched: number;
  created: number;
  failed?: number;
  error?: string;
  reason?: "already_claimed" | "lease_lost";
}

const FEED_FETCH_TIMEOUT_MS = 15_000;
const ENTRY_FETCH_TIMEOUT_MS = 12_000;
const STALE_FETCH_MS = 60_000;
type FeedClaimCondition =
  | { lastFetchStatus: { in: string[] } }
  | { lastFetchStatus: string; lastFetchStartedAt: { lt: Date } };

export async function fetchAndStoreFeed(userId: string, feedId: string, deps: FetchAndStoreFeedDeps = {}): Promise<FeedFetchResult> {
  const prisma = deps.prisma ?? getPrisma();
  const entryRepository = deps.entryRepository ?? createFeedEntriesRepository();
  const fetchFeed = deps.fetchFeed ?? fetch;
  const fetchEntryPage = deps.fetchEntryPage ?? fetchClipFromUrl;
  const now = deps.now ?? (() => new Date());
  const limit = deps.limit ?? DEFAULT_FEED_FETCH_LIMIT;
  const allowSuccessfulRefresh = deps.allowSuccessfulRefresh ?? true;
  const claimStatuses = deps.claimStatuses ?? ["idle", "queued", "error", "partial", ...(allowSuccessfulRefresh ? ["success"] : [])];
  const allowStaleTakeover = deps.allowStaleTakeover ?? true;

  const feed = await prisma.feed.findFirst({
    where: { id: feedId, userId, deletedAt: null },
  });

  if (!feed) return { status: "skipped", fetched: 0, created: 0 };

  const startedAt = now();
  const claimConditions: FeedClaimCondition[] = [{ lastFetchStatus: { in: claimStatuses } }];
  if (allowStaleTakeover) {
    claimConditions.push({ lastFetchStatus: "fetching", lastFetchStartedAt: { lt: new Date(startedAt.getTime() - STALE_FETCH_MS) } });
  }
  const claimWhere = {
    id: feed.id,
    userId,
    deletedAt: null,
    ...(claimConditions.length === 1 ? claimConditions[0] : { OR: claimConditions }),
  };
  const claim = await prisma.feed.updateMany({
    where: claimWhere,
    data: {
      lastFetchStartedAt: startedAt,
      lastFetchStatus: "fetching",
      lastFetchError: null,
      version: { increment: 1 },
    },
  });
  if (claim.count === 0) {
    return { status: "skipped", reason: "already_claimed", fetched: 0, created: 0 };
  }

  try {
    const response = await withTimeout(
      fetchFeed(feed.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
        headers: {
          accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        },
      }),
      FEED_FETCH_TIMEOUT_MS,
      "Feed fetch timed out",
    );
    if (!response.ok) {
      throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
    }

    const entries = parseFeedXml(await response.text()).sort(compareFeedEntryPublishedAt).slice(0, limit);
    let created = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      try {
        const page = await withTimeout(fetchEntryPage(entry.url), ENTRY_FETCH_TIMEOUT_MS, "Feed entry fetch timed out").catch(() => null);
        const title = chooseEntryTitle(entry.title, page?.title);
        const normalized = normalizeFeedEntryContent({
          title,
          url: entry.url,
          content: page?.content ?? entry.content,
        });
        const result = await entryRepository.upsertByFeedUrl(userId, {
          feedId: feed.id,
          title,
          url: entry.url,
          content: normalized.content,
          ...((page?.coverImage ?? normalized.coverImage) ? { coverImage: page?.coverImage ?? normalized.coverImage } : {}),
          ...((page?.excerpt ?? entry.excerpt ?? normalized.excerpt) ? { excerpt: page?.excerpt ?? entry.excerpt ?? normalized.excerpt } : {}),
          sourceName: page?.sourceName ?? feed.title,
          ...((page?.author ?? entry.author) ? { author: page?.author ?? entry.author } : {}),
          ...((page?.publishedAt ?? entry.publishedAt) ? { publishedAt: page?.publishedAt ?? entry.publishedAt } : {}),
        });
        if (result.created) created += 1;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Feed entry processing failed");
      }
    }

    const status = failures.length > 0 ? "partial" : "success";
    const completion = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: now(),
        lastFetchStatus: status,
        lastFetchError: failures[0] ?? null,
        lastFetchCount: created,
        version: { increment: 1 },
      },
    });
    if (completion.count === 0) return { status: "skipped", reason: "lease_lost", fetched: entries.length, created };

    return {
      status: failures.length > 0 ? "partial" : "ok",
      fetched: entries.length,
      created,
      failed: failures.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed fetch failed";
    const failure = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchStatus: "error",
        lastFetchError: message,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    if (failure.count === 0) return { status: "skipped", reason: "lease_lost", fetched: 0, created: 0 };
    return { status: "error", fetched: 0, created: 0, error: message };
  }
}

function compareFeedEntryPublishedAt(left: { publishedAt?: Date }, right: { publishedAt?: Date }) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}

function chooseEntryTitle(feedTitle: string, pageTitle: string | null | undefined): string {
  const cleanFeedTitle = cleanTitleText(feedTitle);
  const cleanPageTitle = pageTitle ? cleanTitleText(pageTitle) : undefined;
  if (!cleanPageTitle) return cleanFeedTitle;
  if (!cleanFeedTitle) return cleanPageTitle;

  const suffix = cleanPageTitle.slice(cleanFeedTitle.length).trim();
  if (cleanPageTitle.startsWith(cleanFeedTitle) && /^[-|｜_·•—–:：]\s*\S+/.test(suffix)) {
    return cleanFeedTitle;
  }

  return cleanPageTitle;
}

function cleanTitleText(value: string): string {
  return decodeTitleEntities(value).replace(/\s+/g, " ").trim();
}

function decodeTitleEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    });
}
