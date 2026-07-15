import { Queue, type JobsOptions } from "bullmq";

import { createProducerRedisConnection } from "./client";

export const queueNames = {
  tag: "tag-queue",
  summary: "summary-queue",
  embedding: "embedding-queue",
} as const;

export interface TagJobPayload {
  userId: string;
  taggableId: string;
  taggableType: "note" | "clip" | "feed_entry";
}

export interface SummaryJobPayload {
  userId: string;
  targetId: string;
  targetType: "note" | "clip" | "feed_entry";
}

export interface EmbeddingJobPayload {
  userId: string;
  targetId: string;
  targetType: "note" | "clip" | "feed_entry";
}

interface AddableQueue<TPayload> {
  add(name: string, data: TPayload, options?: JobsOptions): Promise<unknown>;
}

interface ClosableQueue<TPayload> extends AddableQueue<TPayload> {
  close(): Promise<void>;
}

export interface QueueSet {
  tagQueue: AddableQueue<TagJobPayload>;
  summaryQueue: AddableQueue<SummaryJobPayload>;
  embeddingQueue: AddableQueue<EmbeddingJobPayload>;
  close(): Promise<void>;
}

export function createMewmoQueues(connection: unknown = createProducerRedisConnection()): QueueSet {
  const tagQueue = new Queue(queueNames.tag, { connection } as never) as ClosableQueue<TagJobPayload>;
  const summaryQueue = new Queue(queueNames.summary, { connection } as never) as ClosableQueue<SummaryJobPayload>;
  const embeddingQueue = new Queue(queueNames.embedding, { connection } as never) as ClosableQueue<EmbeddingJobPayload>;

  return {
    tagQueue,
    summaryQueue,
    embeddingQueue,
    async close() {
      await Promise.all([tagQueue.close(), summaryQueue.close(), embeddingQueue.close()]);
      await closeRedisConnection(connection);
    },
  };
}

export function createQueueHelpers(queues: QueueSet = createMewmoQueues()) {
  let closePromise: Promise<void> | undefined;

  return {
    addTagJob(payload: TagJobPayload, options?: JobsOptions) {
      return queues.tagQueue.add("tag", payload, options);
    },

    addSummaryJob(payload: SummaryJobPayload, options?: JobsOptions) {
      return queues.summaryQueue.add("summary", payload, options);
    },

    addEmbeddingJob(payload: EmbeddingJobPayload, options?: JobsOptions) {
      return queues.embeddingQueue.add("embedding", payload, options);
    },

    close() {
      return closePromise ??= queues.close();
    },
  };
}

async function closeRedisConnection(connection: unknown) {
  if (hasQuit(connection)) {
    await connection.quit();
    return;
  }
  if (hasDisconnect(connection)) connection.disconnect();
}

function hasQuit(connection: unknown): connection is { quit(): Promise<unknown> } {
  return typeof connection === "object" && connection !== null && "quit" in connection && typeof connection.quit === "function";
}

function hasDisconnect(connection: unknown): connection is { disconnect(): void } {
  return typeof connection === "object" && connection !== null && "disconnect" in connection && typeof connection.disconnect === "function";
}
