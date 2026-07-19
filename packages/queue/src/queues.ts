import { Queue, type JobsOptions } from "bullmq";

import { createRedisConnection } from "./client";

export const queueNames = {
  tag: "tag-queue",
  summary: "summary-queue",
  feedFetch: "feed-fetch-queue",
  embedding: "embedding-queue",
  videoMetadata: "video-metadata-queue",
  videoTranscript: "video-transcript-queue",
  videoAnalysis: "video-analysis-queue",
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

export interface EmbeddingJobPayload {
  userId: string;
  targetId: string;
  targetType: "note" | "clip" | "feed_entry";
}

export interface VideoJobPayload {
  userId: string;
  feedEntryId: string;
  revision: number;
  force?: boolean;
}

interface AddableQueue<TPayload> {
  add(name: string, data: TPayload, options?: JobsOptions): Promise<unknown>;
}

export interface QueueSet {
  tagQueue: AddableQueue<TagJobPayload>;
  summaryQueue: AddableQueue<SummaryJobPayload>;
  feedFetchQueue: AddableQueue<FeedFetchJobPayload>;
  embeddingQueue: AddableQueue<EmbeddingJobPayload>;
  videoMetadataQueue: AddableQueue<VideoJobPayload>;
  videoTranscriptQueue: AddableQueue<VideoJobPayload>;
  videoAnalysisQueue: AddableQueue<VideoJobPayload>;
}

const VIDEO_NETWORK_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

const VIDEO_ANALYSIS_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export function createMewmoQueues(connection: unknown = createRedisConnection()): QueueSet {
  return {
    tagQueue: new Queue(queueNames.tag, { connection } as never) as AddableQueue<TagJobPayload>,
    summaryQueue: new Queue(queueNames.summary, { connection } as never) as AddableQueue<SummaryJobPayload>,
    feedFetchQueue: new Queue(queueNames.feedFetch, { connection } as never) as AddableQueue<FeedFetchJobPayload>,
    embeddingQueue: new Queue(queueNames.embedding, { connection } as never) as AddableQueue<EmbeddingJobPayload>,
    videoMetadataQueue: new Queue(queueNames.videoMetadata, { connection } as never) as AddableQueue<VideoJobPayload>,
    videoTranscriptQueue: new Queue(queueNames.videoTranscript, { connection } as never) as AddableQueue<VideoJobPayload>,
    videoAnalysisQueue: new Queue(queueNames.videoAnalysis, { connection } as never) as AddableQueue<VideoJobPayload>,
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
      return queues.feedFetchQueue.add("feed-fetch", payload, options);
    },

    addEmbeddingJob(payload: EmbeddingJobPayload, options?: JobsOptions) {
      return queues.embeddingQueue.add("embedding", payload, options);
    },

    addVideoMetadataJob(payload: VideoJobPayload, options?: JobsOptions) {
      return queues.videoMetadataQueue.add(
        "video-metadata",
        payload,
        videoJobOptions("video-metadata", payload, VIDEO_NETWORK_JOB_OPTIONS, options),
      );
    },

    addVideoTranscriptJob(payload: VideoJobPayload, options?: JobsOptions) {
      return queues.videoTranscriptQueue.add(
        "video-transcript",
        payload,
        videoJobOptions("video-transcript", payload, VIDEO_NETWORK_JOB_OPTIONS, options),
      );
    },

    addVideoAnalysisJob(payload: VideoJobPayload, options?: JobsOptions) {
      return queues.videoAnalysisQueue.add(
        "video-analysis",
        payload,
        videoJobOptions("video-analysis", payload, VIDEO_ANALYSIS_JOB_OPTIONS, options),
      );
    },
  };
}

function videoJobOptions(
  stage: "video-metadata" | "video-transcript" | "video-analysis",
  payload: VideoJobPayload,
  defaults: JobsOptions,
  options?: JobsOptions,
): JobsOptions {
  const backoff = options?.backoff ?? defaults.backoff;
  return {
    ...defaults,
    ...options,
    ...(backoff === undefined ? {} : { backoff }),
    jobId: `${stage}:${payload.feedEntryId}:r${payload.revision}`,
  };
}
