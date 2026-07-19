import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeedEntryJob } from "./process-feed-entry-job";

const entry = {
  id: "entry-1",
  userId: "user-1",
  title: "RSS title",
  url: "https://example.com/article",
  content: "saved content",
  excerpt: "saved excerpt",
  author: null,
  publishedAt: null,
  feed: { title: "Example Feed", url: "https://example.com/feed.xml" },
};

describe("processFeedEntryJob", () => {
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const fetchFeed = vi.fn();
  const fetchArticle = vi.fn();
  const summarize = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(entry);
    updateMany.mockResolvedValue({ count: 1 });
    summarize.mockResolvedValue("Mewmo AI result");
  });

  function run(rss: {
    title: string;
    url: string;
    content: string;
    excerpt?: string;
  }) {
    return processFeedEntryJob(
      { userId: "user-1", entryId: "entry-1", rss },
      {
        prisma: { feedEntry: { findFirst, updateMany } },
        fetchFeed,
        fetchArticle,
        summarize,
      },
    );
  }

  it("trusts a full RSS body and skips webpage fetching", async () => {
    const fullRss = `<p>${"RSS正文".repeat(180)}</p>`;
    const result = await run({
      title: "RSS title",
      url: entry.url,
      content: fullRss,
    });

    expect(fetchArticle).not.toHaveBeenCalled();
    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({ content: fullRss }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: fullRss }),
      }),
    );
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { summary: "Mewmo AI result", version: { increment: 1 } },
      }),
    );
    expect(result).toEqual({
      status: "ok",
      entryId: "entry-1",
      usedWebpage: false,
    });
  });

  it("uses a substantially fuller webpage before generating the AI summary", async () => {
    const webContent = `<article>${"完整网页正文".repeat(100)}</article>`;
    fetchArticle.mockResolvedValue({
      title: "Publisher title",
      content: webContent,
      excerpt: "Publisher excerpt",
      coverImage: "https://example.com/cover.jpg",
    });

    const result = await run({
      title: "RSS title",
      url: entry.url,
      content: "RSS short body",
    });

    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Publisher title",
        content: webContent,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Publisher title",
          content: webContent,
        }),
      }),
    );
    expect(result).toEqual({
      status: "ok",
      entryId: "entry-1",
      usedWebpage: true,
    });
  });

  it("does not let an anti-bot page overwrite RSS", async () => {
    fetchArticle.mockResolvedValue({
      title: "Just a moment...",
      content:
        "<script>window._cf_chl_opt = {}</script><p>Verify you are human</p>",
    });

    await run({
      title: "RSS title",
      url: entry.url,
      content: "RSS short body",
    });

    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "RSS title",
        content: "RSS short body",
      }),
    );
  });

  it("keeps the RSS title when webpage extraction falls back to the hostname", async () => {
    fetchArticle.mockResolvedValue({
      title: "example.com",
      content: `<article>${"Full page".repeat(100)}</article>`,
    });

    await run({
      title: "RSS title",
      url: entry.url,
      content: "RSS short body",
    });

    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({ title: "RSS title" }),
    );
  });

  it("recovers the RSS snapshot for older jobs that do not contain one", async () => {
    fetchFeed.mockResolvedValue([
      {
        title: "Recovered RSS",
        url: entry.url,
        content: `<p>${"Recovered".repeat(100)}</p>`,
      },
    ]);

    await processFeedEntryJob(
      { userId: "user-1", entryId: "entry-1" },
      {
        prisma: { feedEntry: { findFirst, updateMany } },
        fetchFeed,
        fetchArticle,
        summarize,
      },
    );

    expect(fetchFeed).toHaveBeenCalledWith(entry.feed.url);
    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Recovered RSS" }),
    );
  });

  it("completes harmlessly when the feed entry was deleted", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      run({ title: "RSS", url: entry.url, content: "Body" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "target_not_found",
    });
    expect(summarize).not.toHaveBeenCalled();
  });
});
