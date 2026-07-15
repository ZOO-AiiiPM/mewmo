import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeed, type FeedCronRecord } from "./process-feed";

const feed: FeedCronRecord = {
  id: "feed-1",
  userId: "user-1",
  url: "https://example.com/feed.xml",
  title: "Example Feed",
  lastFetchStatus: "queued",
  lastFetchStartedAt: null,
};

describe("processFeed", () => {
  const updateMany = vi.fn();
  const upsertSourceByFeedUrl = vi.fn();
  const addSummaryJob = vi.fn();
  const addTagJob = vi.fn();
  const fetchFeed = vi.fn();
  const fetchArticle = vi.fn();
  const startedAt = new Date("2026-07-16T00:10:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    fetchFeed.mockResolvedValue([
      {
        title: "RSS title",
        url: "https://example.com/one",
        content: "RSS body",
        excerpt: "RSS description",
      },
    ]);
    fetchArticle.mockResolvedValue({
      title: "Article title",
      content: "<article>Deep body</article>",
      excerpt: "Publisher description",
      coverImage: "https://example.com/cover.jpg",
    });
    upsertSourceByFeedUrl.mockResolvedValue({
      created: false,
      entry: { id: "entry-1", summary: null },
    });
    addSummaryJob.mockResolvedValue({ id: "summary-1" });
    addTagJob.mockResolvedValue({ id: "tag-1" });
  });

  function dependencies() {
    return {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl },
      queueHelpers: { addSummaryJob, addTagJob },
      fetchFeed,
      fetchArticle,
      now: () => startedAt,
    };
  }

  it("deep-enriches source content and queues AI for an existing entry with no summary", async () => {
    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({ status: "success", upserted: 1, created: 0, failed: 0 });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        content: "<article>Deep body</article>",
        excerpt: "Publisher description",
      }),
    );
    expect(upsertSourceByFeedUrl.mock.calls[0]?.[1]).not.toHaveProperty("summary");
    expect(addSummaryJob).toHaveBeenCalledWith(
      { userId: "user-1", targetId: "entry-1", targetType: "feed_entry" },
      {
        jobId: "summary-feed-entry-entry-1",
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(addTagJob).toHaveBeenCalledWith(
      { userId: "user-1", taggableId: "entry-1", taggableType: "feed_entry" },
      {
        jobId: "tag-feed-entry-entry-1",
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it("claims the exact observed lease and protects completion with the new lease", async () => {
    await processFeed(feed, dependencies());

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: "queued",
        lastFetchStartedAt: null,
      },
      data: {
        lastFetchStartedAt: startedAt,
        lastFetchStatus: "fetching",
        lastFetchError: null,
        version: { increment: 1 },
      },
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: {
        lastFetchedAt: startedAt,
        lastFetchStatus: "success",
        lastFetchError: null,
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
  });

  it("skips work when another process already claimed the feed", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({ status: "skipped", reason: "already_claimed", upserted: 0, created: 0, failed: 0 });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("does not let an old process overwrite a newer completion", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({ status: "skipped", reason: "lease_lost", upserted: 1, created: 0, failed: 0 });
  });

  it("records partial when post-processing fails without rolling back saved entries", async () => {
    addSummaryJob.mockRejectedValueOnce(new Error("redis unavailable"));

    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({ status: "partial", upserted: 1, created: 0, failed: 1 });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastFetchStatus: "partial",
        lastFetchError: "redis unavailable",
      }),
    }));
  });

  it("records a feed-level error for a failed RSS request", async () => {
    fetchFeed.mockRejectedValueOnce(new Error("Feed fetch timed out"));

    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({ status: "error", upserted: 0, created: 0, failed: 1, error: "Feed fetch timed out" });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: {
        lastFetchStatus: "error",
        lastFetchError: "Feed fetch timed out",
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    }));
  });
});
