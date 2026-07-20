import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addClipFetchJob: vi.fn().mockResolvedValue({ id: "clip-job" }),
  addFeedFetchJob: vi.fn().mockResolvedValue({ id: "feed-job" }),
  createQueueHelpers: vi.fn(),
}));

vi.mock("./queues", () => ({
  createQueueHelpers: mocks.createQueueHelpers,
}));

import { addClipFetchJob, addFeedFetchJob } from "./jobs";

describe("job producers", () => {
  mocks.createQueueHelpers.mockReturnValue({
    addTagJob: vi.fn(),
    addSummaryJob: vi.fn(),
    addFeedFetchJob: mocks.addFeedFetchJob,
    addClipFetchJob: mocks.addClipFetchJob,
    addEmbeddingJob: vi.fn(),
  });

  it("reuses one queue helper across repeated job submissions", async () => {
    await addClipFetchJob({ clipId: "clip-1" });
    await addFeedFetchJob({ feedId: "feed-1" });

    expect(mocks.createQueueHelpers).toHaveBeenCalledTimes(1);
    expect(mocks.addClipFetchJob).toHaveBeenCalledWith({ clipId: "clip-1" });
    expect(mocks.addFeedFetchJob).toHaveBeenCalledWith({ feedId: "feed-1" });
  });
});
