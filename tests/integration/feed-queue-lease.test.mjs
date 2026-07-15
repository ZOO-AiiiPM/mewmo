import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { enqueueFeedFetch } from "../../apps/web/src/lib/feed-queue-service.ts";
import { createProducerRedisConnection, createQueueHelpers, createRedisConnection } from "../../packages/queue/src/index.ts";

const queueRequire = createRequire(new URL("../../packages/queue/package.json", import.meta.url));
const { Queue, Worker } = queueRequire("bullmq");

function matchesWhere(state, where) {
  if (where.OR) return where.OR.some((condition) => matchesWhere(state, condition));
  const status = where.lastFetchStatus;
  if (typeof status === "string" && status !== state.lastFetchStatus) return false;
  if (status?.in && !status.in.includes(state.lastFetchStatus)) return false;
  if (status?.notIn?.includes(state.lastFetchStatus)) return false;
  if (where.lastFetchStartedAt === null && state.lastFetchStartedAt !== null) return false;
  if (where.lastFetchStartedAt instanceof Date && state.lastFetchStartedAt?.getTime() !== where.lastFetchStartedAt.getTime()) return false;
  if (where.lastFetchStartedAt?.lt && !(state.lastFetchStartedAt && state.lastFetchStartedAt < where.lastFetchStartedAt.lt)) return false;
  return true;
}

function createPrisma(state) {
  return {
    feed: {
      async findFirst() {
        return { lastFetchStatus: state.lastFetchStatus, lastFetchStartedAt: state.lastFetchStartedAt };
      },
      async updateMany({ where, data }) {
        if (!matchesWhere(state, where)) return { count: 0 };
        if (data.lastFetchStatus !== undefined) state.lastFetchStatus = data.lastFetchStatus;
        if (data.lastFetchStartedAt !== undefined) state.lastFetchStartedAt = data.lastFetchStartedAt;
        return { count: 1 };
      },
    },
  };
}

function deadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

test("stale reclaim creates a second executable BullMQ job while the old job is active", async () => {
  const queueName = `feed-lease-integration-${process.pid}-${Date.now()}`;
  const producerConnection = createProducerRedisConnection();
  const workerConnection = createRedisConnection();
  const queue = new Queue(queueName, { connection: producerConnection });
  const helpers = createQueueHelpers({
    tagQueue: queue,
    summaryQueue: queue,
    feedFetchQueue: queue,
    clipFetchQueue: queue,
    embeddingQueue: queue,
  });
  const processed = [];
  let releaseFirst;
  let markFirstStarted;
  let markSecondFinished;
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  const firstRelease = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const secondFinished = new Promise((resolve) => {
    markSecondFinished = resolve;
  });
  const worker = new Worker(
    queueName,
    async (job) => {
      processed.push(job.id);
      if (processed.length === 1) {
        markFirstStarted();
        await firstRelease;
      } else {
        markSecondFinished();
      }
    },
    { connection: workerConnection, concurrency: 1 },
  );

  const state = { lastFetchStatus: "idle", lastFetchStartedAt: null };
  const prisma = createPrisma(state);
  const firstLease = new Date("2026-07-13T00:00:00.000Z");
  const secondLease = new Date("2026-07-13T00:02:00.000Z");
  try {
    await enqueueFeedFetch("feed-1", { prisma, addJob: helpers.addFeedFetchJob, now: () => firstLease });
    await deadline(firstStarted, 5_000, "first BullMQ job did not start");
    state.lastFetchStatus = "fetching";
    state.lastFetchStartedAt = firstLease;

    await enqueueFeedFetch("feed-1", { prisma, addJob: helpers.addFeedFetchJob, now: () => secondLease });
    assert.equal(await queue.getActiveCount(), 1);
    assert.equal(await queue.getWaitingCount(), 1, "stale reclaim should create a distinct waiting job");

    releaseFirst();
    await deadline(secondFinished, 5_000, "second BullMQ job was deduplicated and never executed");
    assert.equal(processed.length, 2);
    assert.notEqual(processed[0], processed[1]);
  } finally {
    releaseFirst?.();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await producerConnection.quit();
    await workerConnection.quit();
  }
});
