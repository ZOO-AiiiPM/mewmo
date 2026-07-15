import { Worker, type Job } from "bullmq";
import { parseFeedXml } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { createQueueHelpers, createRedisConnection, queueNames, withTimeout, type FeedFetchJobPayload } from "@mewmo/queue";

interface FeedWorkerDeps {
  connection?: unknown;
  fetchFeed?: (url: string, init?: RequestInit) => Promise<Response>;
  queueHelpers?: {
    addSummaryJob: ReturnType<typeof createQueueHelpers>["addSummaryJob"];
    addTagJob: ReturnType<typeof createQueueHelpers>["addTagJob"];
  };
}

class PartialFeedFetchError extends Error {}

const FEED_FETCH_LIMIT = 10;
const FEED_FETCH_TIMEOUT_MS = 15_000;
const POST_PROCESS_TIMEOUT_MS = 3_000;
const STALE_FETCH_MS = 60_000;

export async function processFeedFetchJob(payload: FeedFetchJobPayload, deps: FeedWorkerDeps = {}) {
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({
    where: { id: payload.feedId, deletedAt: null },
  });

  if (!feed) {
    return {
      status: "skipped",
      reason: "feed_not_found",
      upserted: 0,
      created: 0,
      failed: 0,
    };
  }

  const startedAt = new Date();
  const claim = await prisma.feed.updateMany({
    where: {
      id: feed.id,
      deletedAt: null,
      OR: [
        { lastFetchStatus: { in: ["idle", "queued", "error", "partial"] } },
        { lastFetchStatus: "fetching", lastFetchStartedAt: { lt: new Date(startedAt.getTime() - STALE_FETCH_MS) } },
      ],
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
    const fetchFeed = deps.fetchFeed ?? fetch;
    const response = await withTimeout(
      fetchFeed(feed.url, { signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS) }),
      FEED_FETCH_TIMEOUT_MS,
      `Feed fetch timed out for ${feed.id}`,
    );
    if (!response.ok) {
      throw new Error(`Feed fetch failed for ${feed.id}: ${response.status} ${response.statusText}`);
    }

    const entries = parseFeedXml(await response.text()).sort(compareFeedEntryPublishedAt).slice(0, FEED_FETCH_LIMIT);
    const entryRepo = createFeedEntriesRepository();
    const queueHelpers = deps.queueHelpers ?? (deps.connection ? createQueueHelpers() : null);
    const repairPostProcessing = feed.lastFetchStatus === "partial";

    let created = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      try {
        const result = await entryRepo.upsertByFeedUrl(feed.userId, {
          feedId: feed.id,
          title: entry.title,
          url: entry.url,
          content: entry.content,
          ...(entry.excerpt !== undefined && { excerpt: entry.excerpt }),
          ...(entry.author !== undefined && { author: entry.author }),
          ...(entry.publishedAt !== undefined && {
            publishedAt: entry.publishedAt,
          }),
        });

        if (result.created) created += 1;
        const savedEntry = result.entry as { id?: string };
        if (queueHelpers && savedEntry.id && (result.created || repairPostProcessing)) {
          const postProcessing = await Promise.allSettled([
            withTimeout(
              queueHelpers.addSummaryJob(
                { userId: feed.userId, targetId: savedEntry.id, targetType: "feed_entry" },
                { jobId: `summary-feed-entry-${savedEntry.id}`, removeOnComplete: true, removeOnFail: true },
              ),
              POST_PROCESS_TIMEOUT_MS,
              `Summary queue timed out for ${savedEntry.id}`,
            ),
            withTimeout(
              queueHelpers.addTagJob(
                { userId: feed.userId, taggableId: savedEntry.id, taggableType: "feed_entry" },
                { jobId: `tag-feed-entry-${savedEntry.id}`, removeOnComplete: true, removeOnFail: true },
              ),
              POST_PROCESS_TIMEOUT_MS,
              `Tag queue timed out for ${savedEntry.id}`,
            ),
          ]);
          const failedJob = postProcessing.find((job) => job.status === "rejected");
          if (failedJob?.status === "rejected") throw failedJob.reason;
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Feed entry processing failed");
      }
    }

    const status = failures.length > 0 ? "partial" : "success";
    const completion = await prisma.feed.updateMany({
      where: {
        id: feed.id,
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: new Date(),
        lastFetchStatus: status,
        lastFetchError: failures[0] ?? null,
        lastFetchCount: created,
        version: { increment: 1 },
      },
    });
    if (completion.count === 0) {
      return { status: "skipped", reason: "lease_lost", upserted: entries.length, created, failed: failures.length };
    }

    if (failures.length > 0) {
      throw new PartialFeedFetchError(`${failures.length} feed entry failed: ${failures[0]}`);
    }

    return { status, upserted: entries.length, created, failed: 0 };
  } catch (error) {
    if (error instanceof PartialFeedFetchError) throw error;
    const message = error instanceof Error ? error.message : "Feed fetch failed";
    const failure = await prisma.feed.updateMany({
      where: {
        id: feed.id,
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
    throw error;
  }
}

function compareFeedEntryPublishedAt(left: { publishedAt?: Date }, right: { publishedAt?: Date }) {
  return (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
}

export function createFeedWorker(connection: unknown = createRedisConnection()) {
  const queueHelpers = createQueueHelpers();
  return new Worker(queueNames.feedFetch, (job: Job<FeedFetchJobPayload>) => processFeedFetchJob(job.data, { queueHelpers }), { connection } as never);
}
