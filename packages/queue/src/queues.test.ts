import { describe, expect, it, vi } from "vitest";

import { createQueueHelpers, queueNames } from "./queues";

describe("queues", () => {
  it("uses stable queue names", () => {
    expect(queueNames).toEqual({
      tag: "tag-queue",
      summary: "summary-queue",
      feedFetch: "feed-fetch-queue",
      embedding: "embedding-queue",
    });
  });

  it("deduplicates feed fetches while allowing later retries", async () => {
    const add = vi.fn().mockResolvedValue({ id: "feed-fetch-feed-1" });
    const helpers = createQueueHelpers({
      tagQueue: { add: vi.fn() },
      summaryQueue: { add: vi.fn() },
      feedFetchQueue: { add },
      embeddingQueue: { add: vi.fn() },
    });

    await helpers.addFeedFetchJob({ feedId: "feed-1" });

    expect(add).toHaveBeenCalledWith(
      "feed-fetch",
      { feedId: "feed-1" },
      {
        jobId: "feed-fetch-feed-1",
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it("adds typed jobs to the requested queue", async () => {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    const helpers = createQueueHelpers({
      tagQueue: { add },
      summaryQueue: { add: vi.fn() },
      feedFetchQueue: { add: vi.fn() },
      embeddingQueue: { add: vi.fn() },
    });

    await helpers.addTagJob({ userId: "user-1", taggableId: "note-1", taggableType: "note" });

    expect(add).toHaveBeenCalledWith("tag", {
      userId: "user-1",
      taggableId: "note-1",
      taggableType: "note",
    }, undefined);
  });
});
