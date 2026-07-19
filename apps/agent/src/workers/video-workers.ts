import { Worker, type Job } from "bullmq";
import { analyzeVideoTranscript, type VideoAnalysisInput } from "@mewmo/ai";
import { getPrisma } from "@mewmo/db";
import {
  createMewmoQueues,
  createQueueHelpers,
  createRedisWorkerConnection,
  queueNames,
  type VideoJobPayload,
} from "@mewmo/queue";
import {
  videoTranscriptSchema,
  type VideoAnalysisResult,
  type VideoPlatform,
  type VideoTranscriptSegment,
} from "@mewmo/shared";

import {
  resolveVideoProvider,
  type VideoProviderAdapter,
} from "../providers/video/video-provider";

interface VideoWorkerQueues {
  addVideoTranscriptJob?: (payload: VideoJobPayload) => Promise<unknown>;
  addVideoAnalysisJob?: (payload: VideoJobPayload) => Promise<unknown>;
}

interface VideoWorkerDeps {
  prisma?: unknown;
  queues?: VideoWorkerQueues;
  resolveProvider?: (url: string) => VideoProviderAdapter;
  analyze?: (input: VideoAnalysisInput) => Promise<VideoAnalysisResult>;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface VideoDetailRecord {
  feedEntryId: string;
  platform: VideoPlatform;
  externalVideoId: string;
  durationSeconds: number | null;
  transcript: unknown;
  transcriptLanguage: string | null;
  analysisVersion: number;
  feedEntry: {
    id: string;
    url: string;
    title: string;
    sourceName: string | null;
    author: string | null;
    feed: { id: string; type: "video" };
  };
}

interface VideoPrismaClient {
  videoDetail: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  feedEntry: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  $transaction?<T>(callback: (tx: VideoPrismaClient) => Promise<T>): Promise<T>;
}

export async function processVideoMetadataJob(payload: VideoJobPayload, deps: VideoWorkerDeps = {}) {
  const prisma = (deps.prisma ?? getPrisma()) as VideoPrismaClient;
  const detail = await findCurrentDetail(prisma, payload);
  if (!detail) {
    return { status: "skipped", reason: "stale_or_not_found", stage: "metadata" } as const;
  }

  const provider = (deps.resolveProvider ?? resolveVideoProvider)(detail.feedEntry.url);
  const metadata = await provider.fetchMetadata(detail.feedEntry.url, {
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  const persisted = await withTransaction(prisma, async (tx) => {
    const updated = await tx.videoDetail.updateMany({
      where: ownedRevisionWhere(payload),
      data: {
        platform: metadata.platform,
        externalVideoId: metadata.externalVideoId,
        durationSeconds: metadata.durationSeconds,
        sourceTags: metadata.sourceTags,
        processingStatus: "fetching_transcript",
        processingError: null,
      },
    });
    if (updated.count === 0) return false;

    await tx.feedEntry.updateMany({
      where: { id: payload.feedEntryId, userId: payload.userId, deletedAt: null },
      data: {
        title: metadata.title,
        url: metadata.canonicalUrl,
        content: metadata.description,
        excerpt: compactExcerpt(metadata.description),
        coverImage: metadata.coverImage,
        sourceName: metadata.sourceName,
        author: metadata.author,
        publishedAt: metadata.publishedAt,
        version: { increment: 1 },
      },
    });
    return true;
  });

  if (!persisted) {
    return { status: "skipped", reason: "stale_revision", stage: "metadata" } as const;
  }

  const queues = deps.queues ?? createQueueHelpers();
  await queues.addVideoTranscriptJob?.(payload);
  return { status: "ok", stage: "metadata" } as const;
}

export async function processVideoTranscriptJob(payload: VideoJobPayload, deps: VideoWorkerDeps = {}) {
  const prisma = (deps.prisma ?? getPrisma()) as VideoPrismaClient;
  const detail = await findCurrentDetail(prisma, payload);
  if (!detail) {
    return { status: "skipped", reason: "stale_or_not_found", stage: "transcript" } as const;
  }

  const provider = (deps.resolveProvider ?? resolveVideoProvider)(detail.feedEntry.url);
  const transcript = await provider.fetchTranscript(
    { url: detail.feedEntry.url, externalVideoId: detail.externalVideoId },
    { ...(deps.fetch ? { fetch: deps.fetch } : {}) },
  );
  const now = (deps.now ?? (() => new Date()))();

  if (transcript.segments.length === 0) {
    const updated = await prisma.videoDetail.updateMany({
      where: ownedRevisionWhere(payload),
      data: {
        transcript: [],
        transcriptLanguage: transcript.language,
        processingStatus: "no_transcript",
        processingError: null,
        lastProcessedAt: now,
      },
    });
    return updated.count > 0
      ? ({ status: "no_transcript", stage: "transcript" } as const)
      : ({ status: "skipped", reason: "stale_revision", stage: "transcript" } as const);
  }

  const segments = videoTranscriptSchema.parse(transcript.segments);
  const updated = await prisma.videoDetail.updateMany({
    where: ownedRevisionWhere(payload),
    data: {
      transcript: segments,
      transcriptLanguage: transcript.language,
      processingStatus: "analyzing",
      processingError: null,
    },
  });
  if (updated.count === 0) {
    return { status: "skipped", reason: "stale_revision", stage: "transcript" } as const;
  }

  const queues = deps.queues ?? createQueueHelpers();
  await queues.addVideoAnalysisJob?.(payload);
  return { status: "ok", stage: "transcript", segmentCount: segments.length } as const;
}

export async function processVideoAnalysisJob(payload: VideoJobPayload, deps: VideoWorkerDeps = {}) {
  const prisma = (deps.prisma ?? getPrisma()) as VideoPrismaClient;
  const detail = await findCurrentDetail(prisma, payload);
  if (!detail) {
    return { status: "skipped", reason: "stale_or_not_found", stage: "analysis" } as const;
  }

  const transcript = videoTranscriptSchema.parse(detail.transcript) as VideoTranscriptSegment[];
  if (transcript.length === 0) {
    return { status: "skipped", reason: "transcript_empty", stage: "analysis" } as const;
  }

  const analyze = deps.analyze ?? analyzeVideoTranscript;
  const analysis = await analyze({
    title: detail.feedEntry.title,
    ...((detail.feedEntry.sourceName ?? detail.feedEntry.author)
      ? { source: detail.feedEntry.sourceName ?? detail.feedEntry.author ?? "" }
      : {}),
    url: detail.feedEntry.url,
    durationSeconds: detail.durationSeconds,
    transcript,
  });
  const now = (deps.now ?? (() => new Date()))();

  const persisted = await withTransaction(prisma, async (tx) => {
    const updated = await tx.videoDetail.updateMany({
      where: ownedRevisionWhere(payload),
      data: {
        quickJudgment: analysis.quickJudgment,
        keyPoints: analysis.keyPoints,
        targetAudience: analysis.targetAudience,
        chapters: analysis.chapters,
        aiHighlights: analysis.highlights,
        suggestedTags: analysis.suggestedTags,
        processingStatus: "ready",
        processingError: null,
        lastProcessedAt: now,
      },
    });
    if (updated.count === 0) return false;

    await tx.feedEntry.updateMany({
      where: { id: payload.feedEntryId, userId: payload.userId, deletedAt: null },
      data: { summary: analysis.quickJudgment.summary, version: { increment: 1 } },
    });
    return true;
  });

  return persisted
    ? ({ status: "ok", stage: "analysis" } as const)
    : ({ status: "skipped", reason: "stale_revision", stage: "analysis" } as const);
}

export function createVideoMetadataWorker(connection: unknown = createRedisWorkerConnection()) {
  const queues = createQueueHelpers(createMewmoQueues(connection));
  return new Worker(
    queueNames.videoMetadata,
    (job: Job<VideoJobPayload>) => runVideoJob(job, "metadata", (payload) => processVideoMetadataJob(payload, { queues })),
    { connection } as never,
  );
}

export function createVideoTranscriptWorker(connection: unknown = createRedisWorkerConnection()) {
  const queues = createQueueHelpers(createMewmoQueues(connection));
  return new Worker(
    queueNames.videoTranscript,
    (job: Job<VideoJobPayload>) => runVideoJob(job, "transcript", (payload) => processVideoTranscriptJob(payload, { queues })),
    { connection } as never,
  );
}

export function createVideoAnalysisWorker(connection: unknown = createRedisWorkerConnection()) {
  return new Worker(
    queueNames.videoAnalysis,
    (job: Job<VideoJobPayload>) => runVideoJob(job, "analysis", (payload) => processVideoAnalysisJob(payload)),
    { connection } as never,
  );
}

async function runVideoJob<T>(
  job: Job<VideoJobPayload>,
  stage: "metadata" | "transcript" | "analysis",
  process: (payload: VideoJobPayload) => Promise<T>,
) {
  try {
    return await process(job.data);
  } catch (error) {
    const attempts = job.opts.attempts ?? 1;
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    await recordVideoFailure(job.data, stage, error, finalAttempt);
    throw error;
  }
}

async function recordVideoFailure(
  payload: VideoJobPayload,
  stage: "metadata" | "transcript" | "analysis",
  error: unknown,
  finalAttempt: boolean,
) {
  const prisma = getPrisma();
  await prisma.videoDetail.updateMany({
    where: ownedRevisionWhere(payload),
    data: {
      processingAttempts: { increment: 1 },
      processingError: `${stage}: ${safeErrorMessage(error)}`,
      ...(finalAttempt ? { processingStatus: "failed", lastProcessedAt: new Date() } : {}),
    },
  });
}

function findCurrentDetail(prisma: VideoPrismaClient, payload: VideoJobPayload) {
  return prisma.videoDetail.findFirst({
    where: ownedRevisionWhere(payload),
    include: {
      feedEntry: {
        include: { feed: { select: { id: true, type: true } } },
      },
    },
  }) as Promise<VideoDetailRecord | null>;
}

function ownedRevisionWhere(payload: VideoJobPayload) {
  return {
    feedEntryId: payload.feedEntryId,
    analysisVersion: payload.revision,
    feedEntry: {
      userId: payload.userId,
      deletedAt: null,
      feed: { userId: payload.userId, deletedAt: null, type: "video" as const },
    },
  };
}

function withTransaction<T>(prisma: VideoPrismaClient, callback: (tx: VideoPrismaClient) => Promise<T>) {
  return prisma.$transaction ? prisma.$transaction(callback) : callback(prisma);
}

function compactExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized || null;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 1000) || "unknown error";
}
