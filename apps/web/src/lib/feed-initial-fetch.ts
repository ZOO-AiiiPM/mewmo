import { fetchFeedDocument, type ParsedFeedEntry } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";

import { normalizeFeedEntryContent } from "./feed-content";
import { integrationFixtureOrigins } from "./content-fetch-runtime";

export const DEFAULT_INITIAL_FEED_LIMIT = 10;

export interface InitialFeedRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
  version: number;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
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
  status: "success" | "error";
  fetched: number;
  created: number;
  requested: number;
  completedAt?: Date;
  error?: string;
  reason?: "already_claimed" | "lease_lost";
}

export async function fetchInitialFeed(
  userId: string,
  feed: InitialFeedRecord,
  dependencies: FetchInitialFeedDependencies = {},
): Promise<InitialFeedFetchResult> {
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as InitialFeedPrisma);
  const entryRepository = dependencies.entryRepository ?? createFeedEntriesRepository();
  const allowedPrivateOrigins = integrationFixtureOrigins();
  const fetchFeed = dependencies.fetchFeed ?? ((url: string) => fetchFeedDocument(url, {
    ...(allowedPrivateOrigins ? { allowedPrivateOrigins } : {}),
  }));
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  const claim = await prisma.feed.updateMany({
    where: {
      id: feed.id,
      userId,
      deletedAt: null,
      version: feed.version,
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
    return { status: "error", fetched: 0, created: 0, requested: dependencies.limit ?? DEFAULT_INITIAL_FEED_LIMIT, reason: "already_claimed" };
  }

  try {
    const requested = dependencies.limit ?? DEFAULT_INITIAL_FEED_LIMIT;
    const allEntries = (await fetchFeed(feed.url)).sort(compareFeedEntryPublishedAt);
    const entries = allEntries.slice(0, requested);
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

    const completedAt = now();
    const completion = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: completedAt,
        lastFetchStartedAt: null,
        lastFetchStatus: "success",
        lastFetchError: null,
        lastFetchCount: created,
        lastSeenEntryUrl: allEntries[0]?.url ?? null,
        version: { increment: 1 },
      },
    });
    if (completion.count === 0) {
      return { status: "error", fetched: entries.length, created, requested, reason: "lease_lost" };
    }

    return { status: "success", fetched: entries.length, created, requested, completedAt };
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
        lastFetchedAt: null,
        lastFetchStartedAt: null,
        lastFetchStatus: "error",
        lastFetchError: message,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    if (failure.count === 0) {
      return { status: "error", fetched: 0, created: 0, requested: dependencies.limit ?? DEFAULT_INITIAL_FEED_LIMIT, reason: "lease_lost" };
    }
    return { status: "error", fetched: 0, created: 0, requested: dependencies.limit ?? DEFAULT_INITIAL_FEED_LIMIT, error: message };
  }
}

function compareFeedEntryPublishedAt(left: ParsedFeedEntry, right: ParsedFeedEntry) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}
