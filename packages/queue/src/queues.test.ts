import { describe, expect, it, vi } from "vitest";

import { createQueueHelpers, queueNames } from "./queues";

describe("queues", () => {
  it("uses stable queue names", () => {
    expect(queueNames).toEqual({
      tag: "tag-queue",
      summary: "summary-queue",
      embedding: "embedding-queue",
    });
  });

  it("adds typed jobs to the requested queue", async () => {
    const add = vi.fn().mockResolvedValue({ id: "job-1" });
    const helpers = createQueueHelpers({
      tagQueue: { add },
      summaryQueue: { add: vi.fn() },
      embeddingQueue: { add: vi.fn() },
    });

    await helpers.addTagJob({ userId: "user-1", taggableId: "note-1", taggableType: "note" });

    expect(add).toHaveBeenCalledWith("tag", {
      userId: "user-1",
      taggableId: "note-1",
      taggableType: "note",
    }, undefined);
  });

  it("does not expose feed or clip fetch jobs", () => {
    const helpers = createQueueHelpers({
      tagQueue: { add: vi.fn() },
      summaryQueue: { add: vi.fn() },
      embeddingQueue: { add: vi.fn() },
    });

    expect(helpers).not.toHaveProperty("addFeedFetchJob");
    expect(helpers).not.toHaveProperty("addClipFetchJob");
  });
});
