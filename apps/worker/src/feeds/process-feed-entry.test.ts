import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeedEntry } from "./process-feed-entry";

const entry = {
  id: "entry-1",
  userId: "user-1",
  title: "RSS title",
  url: "https://example.com/article",
  content: "saved content",
  excerpt: "saved excerpt",
  author: null,
  publishedAt: null,
  feed: { title: "Example Feed" },
};

describe("processFeedEntry", () => {
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const fetchArticle = vi.fn();
  const summarize = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(entry);
    updateMany.mockResolvedValue({ count: 1 });
    summarize.mockResolvedValue("Mewmo AI result");
  });

  function run(content: string) {
    return processFeedEntry(
      {
        userId: "user-1",
        entryId: "entry-1",
        rss: { title: "RSS title", url: entry.url, content },
      },
      {
        prisma: { feedEntry: { findFirst, updateMany } },
        fetchArticle,
        summarize,
      },
    );
  }

  it("uses full RSS directly and writes the AI result in the same Cron run", async () => {
    const fullRss = `<p>${"RSS正文".repeat(180)}</p>`;
    const result = await run(fullRss);

    expect(fetchArticle).not.toHaveBeenCalled();
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ content: fullRss }));
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { summary: "Mewmo AI result", version: { increment: 1 } },
    }));
    expect(result).toEqual({ status: "ok", entryId: "entry-1", usedWebpage: false });
  });

  it("uses a valid fuller webpage before calling AI", async () => {
    const webContent = `<article>${"完整网页正文".repeat(100)}</article>`;
    fetchArticle.mockResolvedValue({ title: "Publisher title", content: webContent });

    await run("RSS short body");

    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({
      title: "Publisher title",
      content: webContent,
    }));
  });

  it("keeps RSS when webpage extraction returns an anti-bot page", async () => {
    fetchArticle.mockResolvedValue({
      title: "Just a moment...",
      content: "<script>challenge()</script><p>Verify you are human</p>",
    });

    await run("RSS short body");

    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({
      title: "RSS title",
      content: "RSS short body",
    }));
  });

  it("leaves summary null when AI fails so the next Cron can retry", async () => {
    summarize.mockRejectedValue(new Error("AI unavailable"));

    await expect(run("RSS short body")).rejects.toThrow("AI unavailable");
    expect(updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ summary: expect.any(String) }),
    }));
  });
});
