import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeedEntry } from "./process-feed-entry";

const entry = {
  id: "entry-1",
  userId: "user-1",
  title: "RSS title",
  url: "https://example.com/article",
  content: "saved content",
  version: 4,
  excerpt: "saved excerpt",
  author: null,
  publishedAt: null,
  feed: { title: "Example Feed" },
};

describe("processFeedEntry", () => {
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const fetchArticle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(entry);
    updateMany.mockResolvedValue({ count: 1 });
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
      },
    );
  }

  it("uses full RSS directly and returns the new content version without calling AI", async () => {
    const fullRss = `<p>${"RSS正文".repeat(180)}</p>`;
    const result = await run(fullRss);

    expect(fetchArticle).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "ok",
      entryId: "entry-1",
      userId: "user-1",
      version: 5,
      usedWebpage: false,
    });
  });

  it("uses a valid fuller webpage before calling AI", async () => {
    const webContent = `<article>${"完整网页正文".repeat(100)}</article>`;
    fetchArticle.mockResolvedValue({ title: "Publisher title", content: webContent });

    await run("RSS short body");

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: "Publisher title", content: webContent }),
    }));
  });

  it("keeps RSS when webpage extraction returns an anti-bot page", async () => {
    fetchArticle.mockResolvedValue({
      title: "Just a moment...",
      content: "<script>challenge()</script><p>Verify you are human</p>",
    });

    await run("RSS short body");

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: "RSS title", content: "RSS short body" }),
    }));
  });

  it("does not update when the content version changed concurrently", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(run("RSS short body")).resolves.toEqual({
      status: "skipped",
      reason: "version_changed",
    });
  });
});
