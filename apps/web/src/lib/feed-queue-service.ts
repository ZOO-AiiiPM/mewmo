import { getPrisma } from "@mewmo/db";
import { addFeedFetchJob, withTimeout } from "@mewmo/queue";

const FEED_QUEUE_TIMEOUT_MS = 5_000;
const STALE_FETCH_MS = 60_000;

interface FeedQueuePrisma {
  feed: {
    findFirst(args: unknown): Promise<{ lastFetchStatus: string; lastFetchStartedAt: Date | null } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface EnqueueFeedFetchResult {
  queued: boolean;
  status: string;
  startedAt: Date | null;
  fallbackRequired: boolean;
}

export interface EnqueueFeedFetchDeps {
  prisma?: FeedQueuePrisma;
  addJob?: typeof addFeedFetchJob;
  timeout?: typeof withTimeout;
  now?: () => Date;
}

async function currentFeedQueueState(feedId: string, prisma: FeedQueuePrisma): Promise<EnqueueFeedFetchResult> {
  const feed = await prisma.feed.findFirst({
    where: { id: feedId, deletedAt: null },
    select: { lastFetchStatus: true, lastFetchStartedAt: true },
  });
  if (!feed) return { queued: false, status: "missing", startedAt: null, fallbackRequired: false };
  return {
    queued: feed.lastFetchStatus === "queued" || feed.lastFetchStatus === "fetching",
    status: feed.lastFetchStatus,
    startedAt: feed.lastFetchStartedAt,
    fallbackRequired: false,
  };
}

export async function enqueueFeedFetch(feedId: string, deps: EnqueueFeedFetchDeps = {}): Promise<EnqueueFeedFetchResult> {
  const prisma = deps.prisma ?? (getPrisma() as unknown as FeedQueuePrisma);
  const addJob = deps.addJob ?? addFeedFetchJob;
  const timeout = deps.timeout ?? withTimeout;
  const startedAt = (deps.now ?? (() => new Date()))();
  const staleBefore = new Date(startedAt.getTime() - STALE_FETCH_MS);
  const claim = await prisma.feed.updateMany({
    where: {
      id: feedId,
      deletedAt: null,
      OR: [
        { lastFetchStatus: { notIn: ["queued", "fetching"] } },
        {
          lastFetchStatus: { in: ["queued", "fetching"] },
          OR: [{ lastFetchStartedAt: null }, { lastFetchStartedAt: { lt: staleBefore } }],
        },
      ],
    },
    data: {
      lastFetchStatus: "queued",
      lastFetchError: null,
      lastFetchStartedAt: startedAt,
      version: { increment: 1 },
    },
  });
  if (claim.count === 0) return currentFeedQueueState(feedId, prisma);

  try {
    await timeout(addJob({ feedId }), FEED_QUEUE_TIMEOUT_MS, "Feed queue submission timed out");
    return { queued: true, status: "queued", startedAt, fallbackRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue feed fetch";
    const failure = await prisma.feed.updateMany({
      where: {
        id: feedId,
        deletedAt: null,
        lastFetchStatus: "queued",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchStatus: "error",
        lastFetchError: message,
        version: { increment: 1 },
      },
    });
    if (failure.count === 0) return currentFeedQueueState(feedId, prisma);
    return { queued: false, status: "error", startedAt, fallbackRequired: true };
  }
}
