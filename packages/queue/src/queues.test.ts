import { describe, expect, it, vi } from "vitest";

import { createQueueHelpers, queueNames } from "./queues";

describe("queues", () => {
  it("uses stable queue names", () => {
    expect(queueNames).toEqual({
      tag: "tag-queue",
      summary: "summary-queue",
      feedFetch: "feed-fetch-queue",
      embedding: "embedding-queue",
      videoMetadata: "video-metadata-queue",
      videoTranscript: "video-transcript-queue",
      videoAnalysis: "video-analysis-queue",
    });
  });

  it("adds typed jobs to the requested queue", async () => {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    const helpers = createQueueHelpers({
      tagQueue: { add },
      summaryQueue: { add: vi.fn() },
      feedFetchQueue: { add: vi.fn() },
      embeddingQueue: { add: vi.fn() },
      videoMetadataQueue: { add: vi.fn() },
      videoTranscriptQueue: { add: vi.fn() },
      videoAnalysisQueue: { add: vi.fn() },
    });

    await helpers.addTagJob({ userId: "user-1", taggableId: "note-1", taggableType: "note" });

    expect(add).toHaveBeenCalledWith("tag", {
      userId: "user-1",
      taggableId: "note-1",
      taggableType: "note",
    }, undefined);
  });

  it("adds deterministic staged video jobs with retry defaults", async () => {
    const metadataAdd = vi.fn().mockResolvedValue({ id: "metadata-job" });
    const transcriptAdd = vi.fn().mockResolvedValue({ id: "transcript-job" });
    const analysisAdd = vi.fn().mockResolvedValue({ id: "analysis-job" });
    const helpers = createQueueHelpers({
      tagQueue: { add: vi.fn() },
      summaryQueue: { add: vi.fn() },
      feedFetchQueue: { add: vi.fn() },
      embeddingQueue: { add: vi.fn() },
      videoMetadataQueue: { add: metadataAdd },
      videoTranscriptQueue: { add: transcriptAdd },
      videoAnalysisQueue: { add: analysisAdd },
    });
    const payload = { userId: "user-1", feedEntryId: "entry-1", revision: 2 };

    await helpers.addVideoMetadataJob(payload);
    await helpers.addVideoTranscriptJob(payload);
    await helpers.addVideoAnalysisJob(payload);

    expect(metadataAdd).toHaveBeenCalledWith("video-metadata", payload, expect.objectContaining({
      attempts: 4,
      jobId: "video-metadata:entry-1:r2",
      backoff: { type: "exponential", delay: 30_000 },
    }));
    expect(transcriptAdd).toHaveBeenCalledWith("video-transcript", payload, expect.objectContaining({
      attempts: 4,
      jobId: "video-transcript:entry-1:r2",
    }));
    expect(analysisAdd).toHaveBeenCalledWith("video-analysis", payload, expect.objectContaining({
      attempts: 3,
      jobId: "video-analysis:entry-1:r2",
      backoff: { type: "exponential", delay: 15_000 },
    }));
  });
});
