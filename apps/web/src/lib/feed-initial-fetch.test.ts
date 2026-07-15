import { describe, expect, it, vi } from "vitest";

import { fetchInitialFeed } from "./feed-initial-fetch";

const feed = {
  id: "feed-1",
  userId: "user-1",
  url: "https://example.com/feed.xml",
  title: "Example Feed",
  version: 1,
  lastFetchStatus: "idle",
  lastFetchStartedAt: null,
};

describe("fetchInitialFeed", () => {
  it("stores initial RSS entries without visiting article pages and leaves Cron work queued", async () => {
    const startedAt = new Date("2026-07-16T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsertSourceByFeedUrl = vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } });

    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl },
      fetchFeed: vi.fn().mockResolvedValue([
        {
          title: "One",
          url: "https://example.com/one",
          content: "<p>Body</p>",
          excerpt: "Publisher description",
        },
      ]),
      now: () => startedAt,
    });

    expect(result).toEqual({ status: "queued", fetched: 1, created: 1 });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ excerpt: "Publisher description" }),
    );
    expect(upsertSourceByFeedUrl.mock.calls[0]?.[1]).not.toHaveProperty("summary");
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        version: 1,
        lastFetchStatus: "idle",
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
        lastFetchedAt: null,
        lastFetchStartedAt: null,
        lastFetchStatus: "queued",
        lastFetchError: null,
        lastFetchCount: 1,
        version: { increment: 1 },
      },
    });
  });

  it("does not fetch when another process already claimed the new feed", async () => {
    const fetchFeed = vi.fn();
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl: vi.fn() },
      fetchFeed,
    });

    expect(result).toEqual({
      status: "queued",
      fetched: 0,
      created: 0,
      reason: "already_claimed",
    });
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not report ownership after losing the initial-fetch lease", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: {
        upsertSourceByFeedUrl: vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } }),
      },
      fetchFeed: vi.fn().mockResolvedValue([
        { title: "One", url: "https://example.com/one", content: "Body" },
      ]),
    });

    expect(result).toEqual({
      status: "queued",
      fetched: 1,
      created: 1,
      reason: "lease_lost",
    });
  });

  it("records an initial fetch error without deleting the feed", async () => {
    const startedAt = new Date("2026-07-16T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl: vi.fn() },
      fetchFeed: vi.fn().mockRejectedValue(new Error("Feed fetch timed out")),
      now: () => startedAt,
    });

    expect(result).toEqual({
      status: "error",
      fetched: 0,
      created: 0,
      error: "Feed fetch timed out",
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
        lastFetchedAt: null,
        lastFetchStatus: "error",
        lastFetchError: "Feed fetch timed out",
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
  });
});
