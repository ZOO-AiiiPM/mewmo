import { fetchArticleFromUrl, fetchFeedDocument, type ExtractedArticle, type ParsedFeedEntry } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { createQueueHelpers, withTimeout } from "@mewmo/queue";

const FEED_ENTRY_LIMIT = 10;
const POST_PROCESS_TIMEOUT_MS = 3_000;

export interface FeedCronRecord {
  id: string;
  userId: string;
  url: string;
  title: string;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
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
      coverImage?: string;
      excerpt?: string;
      sourceName?: string;
      author?: string;
      publishedAt?: Date;
    },
  ): Promise<{ created: boolean; entry: unknown }>;
}

export interface ProcessFeedQueueHelpers {
  addSummaryJob: ReturnType<typeof createQueueHelpers>["addSummaryJob"];
  addTagJob: ReturnType<typeof createQueueHelpers>["addTagJob"];
}

interface ProcessFeedDependencies {
  prisma?: FeedCronPrisma;
  entryRepository?: FeedEntryRepository;
  queueHelpers?: ProcessFeedQueueHelpers;
  fetchFeed?: (url: string) => Promise<ParsedFeedEntry[]>;
  fetchArticle?: (url: string) => Promise<ExtractedArticle>;
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
  const queueHelpers = dependencies.queueHelpers ?? createQueueHelpers();
  const fetchFeed = dependencies.fetchFeed ?? fetchFeedDocument;
  const fetchArticle = dependencies.fetchArticle ?? fetchArticleFromUrl;
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
    const entries = (await fetchFeed(feed.url)).sort(comparePublishedAt).slice(0, FEED_ENTRY_LIMIT);
    let created = 0;
    const failures: string[] = [];

    for (const sourceEntry of entries) {
      try {
        const article = await fetchArticle(sourceEntry.url).catch(() => null);
        const result = await entryRepository.upsertSourceByFeedUrl(feed.userId, {
          feedId: feed.id,
          title: article?.title ?? sourceEntry.title,
          url: sourceEntry.url,
          content: article?.content || sourceEntry.content,
          ...((article?.coverImage) ? { coverImage: article.coverImage } : {}),
          ...((article?.excerpt ?? sourceEntry.excerpt) ? { excerpt: article?.excerpt ?? sourceEntry.excerpt } : {}),
          sourceName: article?.sourceName ?? feed.title,
          ...((article?.author ?? sourceEntry.author) ? { author: article?.author ?? sourceEntry.author } : {}),
          ...((article?.publishedAt ?? sourceEntry.publishedAt) ? { publishedAt: article?.publishedAt ?? sourceEntry.publishedAt } : {}),
        });
        if (result.created) created += 1;

        const entry = result.entry as { id?: string; summary?: string | null };
        const shouldQueue = result.created || entry.summary === null || feed.lastFetchStatus === "partial";
        if (entry.id && shouldQueue) {
          const jobs = await Promise.allSettled([
            withTimeout(
              queueHelpers.addSummaryJob(
                { userId: feed.userId, targetId: entry.id, targetType: "feed_entry" },
                {
                  jobId: `summary-feed-entry-${entry.id}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              ),
              POST_PROCESS_TIMEOUT_MS,
              `Summary queue timed out for ${entry.id}`,
            ),
            withTimeout(
              queueHelpers.addTagJob(
                { userId: feed.userId, taggableId: entry.id, taggableType: "feed_entry" },
                {
                  jobId: `tag-feed-entry-${entry.id}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              ),
              POST_PROCESS_TIMEOUT_MS,
              `Tag queue timed out for ${entry.id}`,
            ),
          ]);
          const rejected = jobs.find((job) => job.status === "rejected");
          if (rejected?.status === "rejected") throw rejected.reason;
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Feed entry processing failed");
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
        lastFetchStatus: status,
        lastFetchError: failures[0] ?? null,
        lastFetchCount: created,
        version: { increment: 1 },
      },
    });
    if (completion.count === 0) {
      return {
        status: "skipped",
        reason: "lease_lost",
        upserted: entries.length,
        created,
        failed: failures.length,
      };
    }

    return { status, upserted: entries.length, created, failed: failures.length };
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

function comparePublishedAt(left: ParsedFeedEntry, right: ParsedFeedEntry) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}
