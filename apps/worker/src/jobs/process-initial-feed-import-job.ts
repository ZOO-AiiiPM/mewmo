import { fetchFeedDocument, type ParsedFeedEntry } from "@mewmo/content";
import {
  createBackgroundJobsRepository,
  createFeedEntriesRepository,
  getPrisma,
  type FeedInitialImportJobPayload,
} from "@mewmo/db";

interface InitialImportPrisma {
  feed: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface InitialFeedRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
  lastFetchedAt: Date | null;
  lastSeenEntryUrl: string | null;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
}

interface InitialEntryRepository {
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

interface InitialJobsRepository {
  enqueueFeedEntryProcess(userId: string, entryId: string, rss?: {
    title: string;
    url: string;
    content: string;
    excerpt?: string;
    author?: string;
    publishedAt?: string;
  }): Promise<unknown>;
}

interface InitialImportDependencies {
  prisma?: InitialImportPrisma;
  fetchFeed?: (url: string) => Promise<ParsedFeedEntry[]>;
  entryRepository?: InitialEntryRepository;
  jobsRepository?: InitialJobsRepository;
  now?: () => Date;
}

export async function processInitialFeedImportJob(
  payloadValue: unknown,
  dependencies: InitialImportDependencies = {},
) {
  const payload = parsePayload(payloadValue);
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as InitialImportPrisma);
  const allowedPrivateOrigins = integrationFixtureOrigins();
  const fetchFeed = dependencies.fetchFeed ?? ((url: string) => fetchFeedDocument(url, {
    ...(allowedPrivateOrigins ? { allowedPrivateOrigins } : {}),
  }));
  const entryRepository = dependencies.entryRepository ?? createFeedEntriesRepository();
  const jobsRepository = dependencies.jobsRepository ?? createBackgroundJobsRepository();
  const now = dependencies.now ?? (() => new Date());

  const feed = (await prisma.feed.findFirst({
    where: { id: payload.feedId, userId: payload.userId, deletedAt: null },
  })) as InitialFeedRecord | null;
  if (!feed) return { status: "skipped" as const, reason: "target_not_found" as const };
  if (feed.lastFetchedAt || feed.lastSeenEntryUrl) {
    return { status: "skipped" as const, reason: "already_imported" as const };
  }

  const startedAt = now();
  const claim = await prisma.feed.updateMany({
    where: {
      id: feed.id,
      userId: feed.userId,
      deletedAt: null,
      lastFetchedAt: null,
      lastSeenEntryUrl: null,
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
  if (claim.count === 0) return { status: "skipped" as const, reason: "already_claimed" as const };

  try {
    const allEntries = (await fetchFeed(feed.url)).sort(comparePublishedAt);
    const entries = allEntries.slice(0, payload.limit);
    let created = 0;

    for (const sourceEntry of entries) {
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
      const entry = result.entry as { id?: string };
      if (entry.id) {
        await jobsRepository.enqueueFeedEntryProcess(feed.userId, entry.id, {
          title: sourceEntry.title,
          url: sourceEntry.url,
          content: sourceEntry.content,
          ...(sourceEntry.excerpt ? { excerpt: sourceEntry.excerpt } : {}),
          ...(sourceEntry.author ? { author: sourceEntry.author } : {}),
          ...(sourceEntry.publishedAt ? { publishedAt: sourceEntry.publishedAt.toISOString() } : {}),
        });
      }
    }

    const completedAt = now();
    const completion = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        userId: feed.userId,
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
    if (completion.count === 0) return { status: "skipped" as const, reason: "lease_lost" as const };
    return { status: "ok" as const, fetched: entries.length, created };
  } catch (error) {
    await prisma.feed.updateMany({
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
        lastFetchError: error instanceof Error ? error.message : "Initial feed import failed",
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
    throw error;
  }
}

function parsePayload(value: unknown): FeedInitialImportJobPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid initial feed import payload");
  const payload = value as Partial<FeedInitialImportJobPayload>;
  if (
    typeof payload.userId !== "string" ||
    typeof payload.feedId !== "string" ||
    ![5, 10, 20, 50].includes(payload.limit ?? 0)
  ) {
    throw new Error("Invalid initial feed import payload");
  }
  return payload as FeedInitialImportJobPayload;
}

function comparePublishedAt(left: ParsedFeedEntry, right: ParsedFeedEntry) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}

function integrationFixtureOrigins(): string[] | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const fixtureUrl = process.env.API_TEST_ARTICLE_URL;
  if (!fixtureUrl) return undefined;
  try {
    return [new URL(fixtureUrl).origin];
  } catch {
    return undefined;
  }
}
