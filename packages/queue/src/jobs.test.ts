import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addTagJob: vi.fn(),
  addSummaryJob: vi.fn(),
  addEmbeddingJob: vi.fn(),
  createQueueHelpers: vi.fn(),
}));

vi.mock("./queues", () => ({
  createQueueHelpers: mocks.createQueueHelpers,
}));

import { addEmbeddingJob, addSummaryJob, addTagJob } from "./jobs";

describe("job producers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createQueueHelpers.mockReturnValue({
      addTagJob: mocks.addTagJob,
      addSummaryJob: mocks.addSummaryJob,
      addEmbeddingJob: mocks.addEmbeddingJob,
    });
  });

  it("lazily reuses one queue helper across producer calls", async () => {
    mocks.addTagJob.mockResolvedValue({ id: "tag-1" });
    mocks.addSummaryJob.mockResolvedValue({ id: "summary-1" });
    mocks.addEmbeddingJob.mockResolvedValue({ id: "embedding-1" });

    await addTagJob({ userId: "user-1", taggableId: "entry-1", taggableType: "feed_entry" });
    await addSummaryJob({ userId: "user-1", targetId: "entry-1", targetType: "feed_entry" });
    await addEmbeddingJob({ userId: "user-1", targetId: "entry-1", targetType: "feed_entry" });

    expect(mocks.createQueueHelpers).toHaveBeenCalledTimes(1);
    expect(mocks.addTagJob).toHaveBeenCalledTimes(1);
    expect(mocks.addSummaryJob).toHaveBeenCalledTimes(1);
    expect(mocks.addEmbeddingJob).toHaveBeenCalledTimes(1);
  });
});
