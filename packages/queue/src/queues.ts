import { Queue, type JobsOptions } from "bullmq";

import { createProducerRedisConnection } from "./client";

export const queueNames = {
  tag: "tag-queue",
  summary: "summary-queue",
  feedFetch: "feed-fetch-queue",
  clipFetch: "clip-fetch-queue",
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

export interface FeedFetchJobPayload {
  feedId: string;
}

export interface ClipFetchJobPayload {
  clipId: string;
}

export interface EmbeddingJobPayload {
  userId: string;
  targetId: string;
  targetType: "note" | "clip" | "feed_entry";
}

interface AddableQueue<TPayload> {
  add(name: string, data: TPayload, options?: JobsOptions): Promise<unknown>;
}

export interface QueueSet {
  tagQueue: AddableQueue<TagJobPayload>;
  summaryQueue: AddableQueue<SummaryJobPayload>;
  feedFetchQueue: AddableQueue<FeedFetchJobPayload>;
  clipFetchQueue: AddableQueue<ClipFetchJobPayload>;
  embeddingQueue: AddableQueue<EmbeddingJobPayload>;
}

export function createMewmoQueues(connection: unknown = createProducerRedisConnection()): QueueSet {
  return {
    tagQueue: new Queue(queueNames.tag, {
      connection,
    } as never) as AddableQueue<TagJobPayload>,
    summaryQueue: new Queue(queueNames.summary, {
      connection,
    } as never) as AddableQueue<SummaryJobPayload>,
    feedFetchQueue: new Queue(queueNames.feedFetch, {
      connection,
    } as never) as AddableQueue<FeedFetchJobPayload>,
    clipFetchQueue: new Queue(queueNames.clipFetch, {
      connection,
    } as never) as AddableQueue<ClipFetchJobPayload>,
    embeddingQueue: new Queue(queueNames.embedding, {
      connection,
    } as never) as AddableQueue<EmbeddingJobPayload>,
  };
}

export function createQueueHelpers(queues: QueueSet = createMewmoQueues()) {
  return {
    addTagJob(payload: TagJobPayload, options?: JobsOptions) {
      return queues.tagQueue.add("tag", payload, options);
    },

    addSummaryJob(payload: SummaryJobPayload, options?: JobsOptions) {
      return queues.summaryQueue.add("summary", payload, options);
    },

    addFeedFetchJob(payload: FeedFetchJobPayload, options?: JobsOptions) {
      return queues.feedFetchQueue.add("feed-fetch", payload, {
        jobId: `feed-fetch-${payload.feedId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
        ...options,
      });
    },

    addClipFetchJob(payload: ClipFetchJobPayload, options?: JobsOptions) {
      return queues.clipFetchQueue.add("clip-fetch", payload, {
        jobId: `clip-fetch-${payload.clipId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
        ...options,
      });
    },

    addEmbeddingJob(payload: EmbeddingJobPayload, options?: JobsOptions) {
      return queues.embeddingQueue.add("embedding", payload, options);
    },
  };
}
