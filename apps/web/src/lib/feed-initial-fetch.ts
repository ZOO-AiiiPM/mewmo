import { fetchFeedDocument, type ParsedFeedEntry } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";

import { normalizeFeedEntryContent } from "./feed-content";

export const DEFAULT_INITIAL_FEED_LIMIT = 10;

export interface InitialFeedRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
}

interface InitialFeedPrisma {
  feed: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface InitialFeedEntryRepository {
  upsertSourceByFeedUrl(
    userId: string,
    input: {
      feedId: string;
      title: string;
      url: string;
      content: string;
      coverImage?: string;
      excerpt?: string;
      sourceName?: string;
      author?: string;
      publishedAt?: Date;
    },
  ): Promise<{ created: boolean; entry: unknown }>;
}

interface FetchInitialFeedDependencies {
  prisma?: InitialFeedPrisma;
  entryRepository?: InitialFeedEntryRepository;
  fetchFeed?: (url: string) => Promise<ParsedFeedEntry[]>;
  now?: () => Date;
  limit?: number;
}

export interface InitialFeedFetchResult {
  status: "queued" | "error";
  fetched: number;
  created: number;
  error?: string;
}

export async function fetchInitialFeed(
  userId: string,
  feed: InitialFeedRecord,
  dependencies: FetchInitialFeedDependencies = {},
): Promise<InitialFeedFetchResult> {
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as InitialFeedPrisma);
  const entryRepository = dependencies.entryRepository ?? createFeedEntriesRepository();
  const fetchFeed = dependencies.fetchFeed ?? fetchFeedDocument;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  await prisma.feed.updateMany({
    where: { id: feed.id, userId, deletedAt: null },
    data: {
      lastFetchStartedAt: startedAt,
      lastFetchStatus: "fetching",
      lastFetchError: null,
      version: { increment: 1 },
    },
  });

  try {
    const entries = (await fetchFeed(feed.url))
      .sort(compareFeedEntryPublishedAt)
      .slice(0, dependencies.limit ?? DEFAULT_INITIAL_FEED_LIMIT);
    let created = 0;

    for (const entry of entries) {
      const normalized = normalizeFeedEntryContent({
        title: entry.title,
        url: entry.url,
        content: entry.content,
      });
      const result = await entryRepository.upsertSourceByFeedUrl(userId, {
        feedId: feed.id,
        title: entry.title,
        url: entry.url,
        content: normalized.content,
        ...((entry.excerpt ?? normalized.excerpt) ? { excerpt: entry.excerpt ?? normalized.excerpt } : {}),
        ...(normalized.coverImage ? { coverImage: normalized.coverImage } : {}),
        sourceName: feed.title,
        ...(entry.author ? { author: entry.author } : {}),
        ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
      });
      if (result.created) created += 1;
    }

    await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: null,
        lastFetchStartedAt: null,
        lastFetchStatus: "queued",
        lastFetchError: null,
        lastFetchCount: created,
        version: { increment: 1 },
      },
    });

    return { status: "queued", fetched: entries.length, created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed fetch failed";
    await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: null,
        lastFetchStatus: "error",
        lastFetchError: message,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    return { status: "error", fetched: 0, created: 0, error: message };
  }
}

function compareFeedEntryPublishedAt(left: ParsedFeedEntry, right: ParsedFeedEntry) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}
