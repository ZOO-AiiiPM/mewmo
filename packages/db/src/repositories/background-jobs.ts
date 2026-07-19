import { getPrisma } from "../client";

export const FEED_ENTRY_PROCESS_JOB_TYPE = "feed_entry_process" as const;
export const FEED_INITIAL_IMPORT_JOB_TYPE = "feed_initial_import" as const;

export interface FeedInitialImportJobPayload {
  userId: string;
  feedId: string;
  limit: 5 | 10 | 20 | 50;
}

export interface FeedEntryProcessJobPayload {
  userId: string;
  entryId: string;
  rss?: {
    title: string;
    url: string;
    content: string;
    excerpt?: string;
    author?: string;
    publishedAt?: string;
  };
}

export interface ClaimedBackgroundJob {
  id: string;
  type: typeof FEED_ENTRY_PROCESS_JOB_TYPE | typeof FEED_INITIAL_IMPORT_JOB_TYPE;
  payload: unknown;
  status: "running";
  lockedUntil: Date;
  attempts: number;
  maxAttempts: number;
  userId: string;
}

interface BackgroundJobsClient {
  backgroundJob: {
    upsert(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  feedEntry: {
    findMany(args: unknown): Promise<unknown>;
  };
}

export function createBackgroundJobsRepository(client: unknown = getPrisma()) {
  const db = client as BackgroundJobsClient;

  const enqueueFeedEntryProcess = (
    userId: string,
    entryId: string,
    rss?: FeedEntryProcessJobPayload["rss"],
  ) =>
    db.backgroundJob.upsert({
      where: {
        type_dedupeKey: {
          type: FEED_ENTRY_PROCESS_JOB_TYPE,
          dedupeKey: `feed-entry:${entryId}`,
        },
      },
      create: {
        type: FEED_ENTRY_PROCESS_JOB_TYPE,
        dedupeKey: `feed-entry:${entryId}`,
        payload: { userId, entryId, ...(rss ? { rss } : {}) },
        userId,
      },
      update: {},
    });

  const enqueueInitialFeedImport = (
    userId: string,
    feedId: string,
    limit: FeedInitialImportJobPayload["limit"],
  ) =>
    db.backgroundJob.upsert({
      where: {
        type_dedupeKey: {
          type: FEED_INITIAL_IMPORT_JOB_TYPE,
          dedupeKey: `feed-initial:${feedId}`,
        },
      },
      create: {
        type: FEED_INITIAL_IMPORT_JOB_TYPE,
        dedupeKey: `feed-initial:${feedId}`,
        payload: { userId, feedId, limit },
        userId,
      },
      update: {},
    });

  return {
    enqueueFeedEntryProcess,
    enqueueInitialFeedImport,

    async enqueueMissingFeedEntryProcessJobs(limit = 500) {
      const entries = (await db.feedEntry.findMany({
        where: { deletedAt: null, summary: null },
        select: { id: true, userId: true },
        orderBy: { createdAt: "asc" },
        take: limit,
      })) as Array<{ id: string; userId: string }>;

      await Promise.all(
        entries.map((entry) => enqueueFeedEntryProcess(entry.userId, entry.id)),
      );
      return entries.length;
    },

    async claimNext(
      now = new Date(),
      leaseMs = 5 * 60_000,
    ): Promise<ClaimedBackgroundJob | null> {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const candidate = (await db.backgroundJob.findFirst({
          where: {
            type: { in: [FEED_INITIAL_IMPORT_JOB_TYPE, FEED_ENTRY_PROCESS_JOB_TYPE] },
            OR: [
              { status: "pending", runAt: { lte: now } },
              { status: "running", lockedUntil: { lte: now } },
            ],
          },
          orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
        })) as {
          id: string;
          status: "pending" | "running";
          lockedUntil: Date | null;
        } | null;
        if (!candidate) return null;

        const lockedUntil = new Date(now.getTime() + leaseMs);
        const claim = await db.backgroundJob.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            ...(candidate.status === "running"
              ? { lockedUntil: candidate.lockedUntil }
              : { runAt: { lte: now } }),
          },
          data: {
            status: "running",
            lockedUntil,
            lastError: null,
            finishedAt: null,
            attempts: { increment: 1 },
          },
        });
        if (claim.count === 0) continue;

        return (await db.backgroundJob.findUnique({
          where: { id: candidate.id },
        })) as ClaimedBackgroundJob;
      }

      return null;
    },

    complete(job: ClaimedBackgroundJob, now = new Date()) {
      return db.backgroundJob.updateMany({
        where: { id: job.id, status: "running", lockedUntil: job.lockedUntil },
        data: {
          status: "succeeded",
          lockedUntil: null,
          lastError: null,
          finishedAt: now,
        },
      });
    },

    fail(job: ClaimedBackgroundJob, error: string, now = new Date()) {
      const retry = job.attempts < job.maxAttempts;
      return db.backgroundJob.updateMany({
        where: { id: job.id, status: "running", lockedUntil: job.lockedUntil },
        data: retry
          ? {
              status: "pending",
              runAt: new Date(
                now.getTime() + Math.min(60_000, 2 ** job.attempts * 1_000),
              ),
              lockedUntil: null,
              lastError: error,
            }
          : {
              status: "failed",
              lockedUntil: null,
              lastError: error,
              finishedAt: now,
            },
      });
    },
  };
}
