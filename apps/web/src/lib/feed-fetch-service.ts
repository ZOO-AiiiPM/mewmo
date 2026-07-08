import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";

import { fetchClipFromUrl } from "./clip-fetch";
import { normalizeFeedEntryContent } from "./feed-content";
import { parseFeedXml } from "./feed-parser";

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
  };
}

interface FeedEntryRepository {
  upsertByFeedUrl(userId: string, input: {
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
  }): Promise<{ created: boolean; entry: unknown }>;
}

interface FetchAndStoreFeedDeps {
  prisma?: FeedFetchPrisma;
  entryRepository?: FeedEntryRepository;
  fetchFeed?: typeof fetch;
  fetchEntryPage?: typeof fetchClipFromUrl;
  now?: () => Date;
  limit?: number;
}

export interface FeedFetchResult {
  status: "ok" | "skipped" | "error";
  fetched: number;
  created: number;
  error?: string;
}

export async function fetchAndStoreFeed(
  userId: string,
  feedId: string,
  deps: FetchAndStoreFeedDeps = {},
): Promise<FeedFetchResult> {
  const prisma = deps.prisma ?? getPrisma();
  const entryRepository = deps.entryRepository ?? createFeedEntriesRepository();
  const fetchFeed = deps.fetchFeed ?? fetch;
  const fetchEntryPage = deps.fetchEntryPage ?? fetchClipFromUrl;
  const now = deps.now ?? (() => new Date());
  const limit = deps.limit ?? DEFAULT_FEED_FETCH_LIMIT;

  const feed = await prisma.feed.findFirst({
    where: { id: feedId, userId, deletedAt: null },
  });

  if (!feed) return { status: "skipped", fetched: 0, created: 0 };

  await prisma.feed.update({
    where: { id: feed.id },
    data: {
      lastFetchStartedAt: now(),
      lastFetchStatus: "fetching",
      lastFetchError: null,
      version: { increment: 1 },
    },
  });

  try {
    const response = await fetchFeed(feed.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
    }

    const entries = parseFeedXml(await response.text(), limit);
    let created = 0;
    for (const entry of entries) {
      const page = await fetchEntryPage(entry.url).catch(() => null);
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
        ...(page?.summary ?? normalized.excerpt ? { summary: page?.summary ?? normalized.excerpt } : {}),
        ...(page?.coverImage ?? normalized.coverImage ? { coverImage: page?.coverImage ?? normalized.coverImage } : {}),
        ...(normalized.excerpt ? { excerpt: normalized.excerpt } : {}),
        sourceName: page?.sourceName ?? feed.title,
        ...(page?.author ?? entry.author ? { author: page?.author ?? entry.author } : {}),
        ...(page?.publishedAt ?? entry.publishedAt ? { publishedAt: page?.publishedAt ?? entry.publishedAt } : {}),
      });
      if (result.created) created += 1;
    }

    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        lastFetchedAt: now(),
        lastFetchStatus: "success",
        lastFetchError: null,
        lastFetchCount: created,
        version: { increment: 1 },
      },
    });

    return { status: "ok", fetched: entries.length, created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed fetch failed";
    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        lastFetchStatus: "error",
        lastFetchError: message,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    return { status: "error", fetched: 0, created: 0, error: message };
  }
}

function chooseEntryTitle(feedTitle: string, pageTitle: string | null | undefined): string {
  const cleanFeedTitle = cleanTitleText(feedTitle);
  const cleanPageTitle = pageTitle ? cleanTitleText(pageTitle) : undefined;
  if (!cleanPageTitle) return cleanFeedTitle;
  if (!cleanFeedTitle) return cleanPageTitle;

  const suffix = cleanPageTitle.slice(cleanFeedTitle.length).trim();
  if (
    cleanPageTitle.startsWith(cleanFeedTitle) &&
    /^[-|｜_·•—–:：]\s*\S+/.test(suffix)
  ) {
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
