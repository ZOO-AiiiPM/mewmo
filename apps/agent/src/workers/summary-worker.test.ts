import { describe, expect, it, vi } from "vitest";

import { processSummaryJob } from "./summary-worker";

describe("summary worker", () => {
  it("summarizes clips and writes the result back to the scoped row", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "clip-1",
      title: "Saved article",
      url: "https://example.com/article",
      content: "Readable text",
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const summarize = vi.fn().mockResolvedValue("Generated summary");

    const result = await processSummaryJob(
      { userId: "user-1", targetId: "clip-1", targetType: "clip" },
      {
        summarize,
        prisma: {
          clip: { findFirst, updateMany },
        },
      },
    );

    expect(result).toEqual({ status: "ok", targetType: "clip", targetId: "clip-1" });
    expect(summarize).toHaveBeenCalledWith({
      type: "clip",
      title: "Saved article",
      source: "example.com",
      url: "https://example.com/article",
      content: "Readable text",
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "clip-1", userId: "user-1", deletedAt: null },
      data: { summary: "Generated summary", version: { increment: 1 } },
    });
  });

  it("summarizes feed entries and uses the parent feed as source", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "entry-1",
      title: "Feed article",
      url: "https://example.com/feed/article",
      content: "Feed text",
      feed: { title: "Example Feed" },
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const summarize = vi.fn().mockResolvedValue("Feed summary");

    await processSummaryJob(
      { userId: "user-1", targetId: "entry-1", targetType: "feed_entry" },
      {
        summarize,
        prisma: {
          feedEntry: { findFirst, updateMany },
        },
      },
    );

    expect(summarize).toHaveBeenCalledWith({
      type: "feed_entry",
      title: "Feed article",
      source: "Example Feed",
      url: "https://example.com/feed/article",
      content: "Feed text",
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1", deletedAt: null },
      data: { summary: "Feed summary", version: { increment: 1 } },
    });
  });

  it("skips unsupported summary targets", async () => {
    const summarize = vi.fn();

    const result = await processSummaryJob(
      { userId: "user-1", targetId: "note-1", targetType: "note" },
      { summarize, prisma: {} },
    );

    expect(result).toEqual({ status: "skipped", reason: "unsupported_target_type" });
    expect(summarize).not.toHaveBeenCalled();
  });
});
