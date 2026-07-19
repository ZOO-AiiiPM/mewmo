import { describe, expect, it, vi } from "vitest";

import {
  processVideoAnalysisJob,
  processVideoMetadataJob,
  processVideoTranscriptJob,
} from "./video-workers";

const payload = {
  userId: "user-1",
  feedEntryId: "entry-1",
  revision: 1,
};

describe("video workers", () => {
  it("persists metadata under the matching revision before enqueueing transcript", async () => {
    const detail = videoDetailRecord();
    const findFirst = vi.fn().mockResolvedValue(detail);
    const updateDetail = vi.fn().mockResolvedValue({ count: 1 });
    const updateEntry = vi.fn().mockResolvedValue({ count: 1 });
    const addVideoTranscriptJob = vi.fn().mockResolvedValue(undefined);
    const prisma = transactionClient({
      videoDetail: { findFirst, updateMany: updateDetail },
      feedEntry: { updateMany: updateEntry },
    });
    const provider = {
      platform: "bilibili" as const,
      match: vi.fn().mockReturnValue(true),
      extractExternalVideoId: vi.fn().mockReturnValue("BV1mock001"),
      fetchMetadata: vi.fn().mockResolvedValue({
        platform: "bilibili",
        externalVideoId: "BV1mock001",
        canonicalUrl: "https://www.bilibili.com/video/BV1mock001",
        title: "真实视频标题",
        description: "原平台简介",
        coverImage: "https://example.com/cover.jpg",
        durationSeconds: 125,
        author: "Mewmo Lab",
        sourceName: "哔哩哔哩",
        publishedAt: new Date("2026-07-19T08:00:00.000Z"),
        sourceTags: ["AI", "产品"],
      }),
      fetchTranscript: vi.fn(),
    };

    await expect(
      processVideoMetadataJob(payload, {
        prisma,
        resolveProvider: () => provider,
        queues: { addVideoTranscriptJob },
      }),
    ).resolves.toMatchObject({ status: "ok", stage: "metadata" });

    expect(updateDetail).toHaveBeenCalledWith({
      where: {
        feedEntryId: "entry-1",
        analysisVersion: 1,
        feedEntry: expect.objectContaining({ userId: "user-1" }),
      },
      data: {
        platform: "bilibili",
        externalVideoId: "BV1mock001",
        durationSeconds: 125,
        sourceTags: ["AI", "产品"],
        processingStatus: "fetching_transcript",
        processingError: null,
      },
    });
    expect(updateEntry).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1", deletedAt: null },
      data: expect.objectContaining({
        title: "真实视频标题",
        url: "https://www.bilibili.com/video/BV1mock001",
        content: "原平台简介",
        coverImage: "https://example.com/cover.jpg",
        version: { increment: 1 },
      }),
    });
    expect(addVideoTranscriptJob).toHaveBeenCalledWith(payload);
  });

  it("stops honestly at no_transcript without enqueueing analysis", async () => {
    const findFirst = vi.fn().mockResolvedValue(videoDetailRecord());
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const addVideoAnalysisJob = vi.fn();
    const provider = {
      platform: "bilibili" as const,
      match: vi.fn().mockReturnValue(true),
      extractExternalVideoId: vi.fn().mockReturnValue("BV1mock001"),
      fetchMetadata: vi.fn(),
      fetchTranscript: vi.fn().mockResolvedValue({ language: null, segments: [] }),
    };

    await expect(
      processVideoTranscriptJob(payload, {
        prisma: { videoDetail: { findFirst, updateMany } },
        resolveProvider: () => provider,
        queues: { addVideoAnalysisJob },
        now: () => new Date("2026-07-19T09:00:00.000Z"),
      }),
    ).resolves.toEqual({ status: "no_transcript", stage: "transcript" });

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ feedEntryId: "entry-1", analysisVersion: 1 }),
      data: {
        transcript: [],
        transcriptLanguage: null,
        processingStatus: "no_transcript",
        processingError: null,
        lastProcessedAt: new Date("2026-07-19T09:00:00.000Z"),
      },
    });
    expect(addVideoAnalysisJob).not.toHaveBeenCalled();
  });

  it("persists a validated analysis and mirrors its compact summary", async () => {
    const detail = videoDetailRecord({
      transcript: [{ startSeconds: 0, endSeconds: 30, text: "字幕正文" }],
      transcriptLanguage: "zh-CN",
    });
    const findFirst = vi.fn().mockResolvedValue(detail);
    const updateDetail = vi.fn().mockResolvedValue({ count: 1 });
    const updateEntry = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = transactionClient({
      videoDetail: { findFirst, updateMany: updateDetail },
      feedEntry: { updateMany: updateEntry },
    });
    const analysis = {
      schemaVersion: 1 as const,
      quickJudgment: {
        summary: "核心摘要",
        highlights: ["亮点"],
        thoughts: ["思考"],
        terms: [{ term: "术语", explanation: "解释" }],
      },
      keyPoints: ["关键点"],
      targetAudience: "产品经理",
      chapters: [{ startSeconds: 0, endSeconds: 30, title: "开场", theme: "背景", summary: "章节总结" }],
      highlights: [{ startSeconds: 12, title: "高光", note: "值得记录", score: 90 }],
      suggestedTags: ["AI"],
    };

    await expect(
      processVideoAnalysisJob(payload, {
        prisma,
        analyze: vi.fn().mockResolvedValue(analysis),
        now: () => new Date("2026-07-19T09:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "ok", stage: "analysis" });

    expect(updateDetail).toHaveBeenCalledWith({
      where: expect.objectContaining({ feedEntryId: "entry-1", analysisVersion: 1 }),
      data: {
        quickJudgment: analysis.quickJudgment,
        keyPoints: analysis.keyPoints,
        targetAudience: analysis.targetAudience,
        chapters: analysis.chapters,
        aiHighlights: analysis.highlights,
        suggestedTags: analysis.suggestedTags,
        processingStatus: "ready",
        processingError: null,
        lastProcessedAt: new Date("2026-07-19T09:00:00.000Z"),
      },
    });
    expect(updateEntry).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1", deletedAt: null },
      data: { summary: "核心摘要", version: { increment: 1 } },
    });
  });

  it("skips stale revisions without calling providers", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const resolveProvider = vi.fn();

    await expect(
      processVideoMetadataJob(payload, {
        prisma: { videoDetail: { findFirst } },
        resolveProvider,
        queues: { addVideoTranscriptJob: vi.fn() },
      }),
    ).resolves.toEqual({ status: "skipped", reason: "stale_or_not_found", stage: "metadata" });
    expect(resolveProvider).not.toHaveBeenCalled();
  });
});

function videoDetailRecord(overrides: Record<string, unknown> = {}) {
  return {
    feedEntryId: "entry-1",
    platform: "bilibili",
    externalVideoId: "BV1mock001",
    durationSeconds: 125,
    transcript: null,
    transcriptLanguage: null,
    analysisVersion: 1,
    feedEntry: {
      id: "entry-1",
      url: "https://www.bilibili.com/video/BV1mock001",
      title: "占位标题",
      sourceName: "哔哩哔哩",
      author: null,
      feed: { id: "feed-1", type: "video" },
    },
    ...overrides,
  };
}

function transactionClient<T extends Record<string, unknown>>(client: T) {
  return {
    ...client,
    $transaction: vi.fn(async (callback: (tx: T) => Promise<unknown>) => callback(client)),
  };
}
