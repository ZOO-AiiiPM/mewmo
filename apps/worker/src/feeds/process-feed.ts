import { fetchFeedDocument, type ParsedFeedEntry } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";

import { findRssEntryByUrl } from "./feed-entry-content";
import { processFeedEntry, type ProcessFeedEntryInput } from "./process-feed-entry";

export interface FeedCronRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
  lastFetchedAt: Date | null;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
  lastSeenEntryUrl: string | null;
}

interface FeedCronPrisma {
  feed: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface FeedEntryRepository {
  upsertSourceByFeedUrl(
    userId: string,
    input: {
      feedId: string;
      title: string;
      url: string;
      content: string;
      excerpt?: string;
      sourceName?: string;
      author?: string;
      publishedAt?: Date;
    },
  ): Promise<{ created: boolean; entry: unknown }>;
}

interface ProcessFeedDependencies {
  prisma?: FeedCronPrisma;
  entryRepository?: FeedEntryRepository;
  fetchFeed?: (url: string) => Promise<ParsedFeedEntry[]>;
  findPendingEntries?: (userId: string, feedId: string) => Promise<Array<{ id: string; url: string }>>;
  processEntry?: (input: ProcessFeedEntryInput) => Promise<unknown>;
  now?: () => Date;
}

export type ProcessFeedResult =
  | { status: "success" | "partial"; upserted: number; created: number; failed: number }
  | { status: "error"; upserted: number; created: number; failed: number; error: string }
  | { status: "skipped"; reason: "already_claimed" | "lease_lost"; upserted: number; created: number; failed: number };

export async function processFeed(
  feed: FeedCronRecord,
  dependencies: ProcessFeedDependencies = {},
): Promise<ProcessFeedResult> {
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as FeedCronPrisma);
  const entryRepository = dependencies.entryRepository ?? createFeedEntriesRepository();
  const fetchFeed = dependencies.fetchFeed ?? fetchFeedDocument;
  const findPendingEntries = dependencies.findPendingEntries ?? (async (userId, feedId) =>
    getPrisma().feedEntry.findMany({
      where: { userId, feedId, deletedAt: null, summary: null },
      select: { id: true, url: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }));
  const processEntry = dependencies.processEntry ?? processFeedEntry;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  const claim = await prisma.feed.updateMany({
    where: {
      id: feed.id,
      userId: feed.userId,
      deletedAt: null,
      lastFetchStatus: feed.lastFetchStatus,
      lastFetchStartedAt: feed.lastFetchStartedAt,
    },
    data: {
      lastFetchStartedAt: startedAt,
      lastFetchStatus: "fetching",
      lastFetchError: null,
      version: { increment: 1 },
    },
  });
  if (claim.count === 0) {
    return { status: "skipped", reason: "already_claimed", upserted: 0, created: 0, failed: 0 };
  }

  try {
    const entries = (await fetchFeed(feed.url)).sort(comparePublishedAt);
    const unseenEntries = selectUnseenFeedEntries(entries, feed);
    let created = 0;
    const failures: string[] = [];

    for (const sourceEntry of unseenEntries) {
      try {
        const result = await entryRepository.upsertSourceByFeedUrl(feed.userId, {
          feedId: feed.id,
          title: sourceEntry.title,
          url: sourceEntry.url,
          content: sourceEntry.content,
          ...(sourceEntry.excerpt ? { excerpt: sourceEntry.excerpt } : {}),
          sourceName: feed.title,
          ...(sourceEntry.author ? { author: sourceEntry.author } : {}),
          ...(sourceEntry.publishedAt ? { publishedAt: sourceEntry.publishedAt } : {}),
        });
        if (result.created) created += 1;

      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Feed entry processing failed");
      }
    }

    const pendingEntries = await findPendingEntries(feed.userId, feed.id);
    for (const pendingEntry of pendingEntries) {
      try {
        const rss = findRssEntryByUrl(entries, pendingEntry.url);
        await processEntry({
          userId: feed.userId,
          entryId: pendingEntry.id,
          ...(rss ? { rss } : {}),
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Feed AI summary failed");
      }
    }

    const status = failures.length > 0 ? "partial" : "success";
    const completion = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId: feed.userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: now(),
        lastFetchStartedAt: null,
        lastFetchStatus: status,
        lastFetchError: failures[0] ?? null,
        lastFetchCount: created,
        lastSeenEntryUrl: entries[0]?.url ?? feed.lastSeenEntryUrl,
        version: { increment: 1 },
      },
    });
    if (completion.count === 0) {
      return {
        status: "skipped",
        reason: "lease_lost",
        upserted: unseenEntries.length,
        created,
        failed: failures.length,
      };
    }

    return { status, upserted: unseenEntries.length, created, failed: failures.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed fetch failed";
    const failure = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId: feed.userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchStartedAt: null,
        lastFetchStatus: "error",
        lastFetchError: message,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    if (failure.count === 0) {
      return { status: "skipped", reason: "lease_lost", upserted: 0, created: 0, failed: 0 };
    }
    return { status: "error", upserted: 0, created: 0, failed: 1, error: message };
  }
}

export function selectUnseenFeedEntries(entries: ParsedFeedEntry[], feed: Pick<FeedCronRecord, "lastSeenEntryUrl" | "lastFetchedAt">) {
  if (entries.length === 0) return [];

  if (feed.lastSeenEntryUrl) {
    const cursorIndex = entries.findIndex((entry) => entry.url === feed.lastSeenEntryUrl);
    if (cursorIndex >= 0) return entries.slice(0, cursorIndex);
  }

  if (!feed.lastFetchedAt) return [];
  return entries.filter((entry) => entry.publishedAt && entry.publishedAt > feed.lastFetchedAt!);
}

function comparePublishedAt(left: ParsedFeedEntry, right: ParsedFeedEntry) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}
