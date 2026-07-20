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
  it("imports the selected RSS history, saves the newest cursor, and creates DB jobs", async () => {
    const completedAt = new Date("2026-07-16T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsertSourceByFeedUrl = vi
      .fn()
      .mockResolvedValue({ created: true, entry: { id: "entry-1", version: 1 } });
    const enqueueWorkflows = vi.fn().mockResolvedValue([]);

    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl },
      enqueueWorkflows,
      fetchFeed: vi.fn().mockResolvedValue([
        {
          title: "Newest",
          url: "https://example.com/newest",
          content: "<p>Newest body</p>",
          excerpt: "Publisher description",
          publishedAt: new Date("2026-07-15T00:00:00Z"),
        },
        {
          title: "Older",
          url: "https://example.com/older",
          content: "<p>Older body</p>",
          publishedAt: new Date("2026-07-14T00:00:00Z"),
        },
      ]),
      now: () => completedAt,
      limit: 1,
    });

    expect(result).toEqual({
      status: "success",
      fetched: 1,
      created: 1,
      requested: 1,
      completedAt,
    });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledTimes(1);
    expect(enqueueWorkflows).toHaveBeenCalledWith({
      userId: "user-1",
      targetType: "feed_entry",
      targetId: "entry-1",
      inputVersion: 1,
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastFetchedAt: completedAt,
          lastFetchStartedAt: null,
          lastFetchStatus: "success",
          lastSeenEntryUrl: "https://example.com/newest",
        }),
      }),
    );
  });

  it("does not fetch when another process already claimed the new feed", async () => {
    const fetchFeed = vi.fn();
    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } },
      entryRepository: { upsertSourceByFeedUrl: vi.fn() },
      enqueueWorkflows: vi.fn(),
      fetchFeed,
      limit: 5,
    });

    expect(result).toEqual({
      status: "error",
      fetched: 0,
      created: 0,
      requested: 5,
      reason: "already_claimed",
    });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("does not report ownership after losing the initial-fetch lease", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: {
        upsertSourceByFeedUrl: vi
          .fn()
          .mockResolvedValue({ created: true, entry: { id: "entry-1", version: 1 } }),
      },
      enqueueWorkflows: vi.fn().mockResolvedValue([]),
      fetchFeed: vi
        .fn()
        .mockResolvedValue([
          { title: "One", url: "https://example.com/one", content: "Body" },
        ]),
    });

    expect(result).toEqual({
      status: "error",
      fetched: 1,
      created: 1,
      requested: 10,
      reason: "lease_lost",
    });
  });

  it("records an initial RSS error without deleting the feed", async () => {
    const completedAt = new Date("2026-07-16T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl: vi.fn() },
      enqueueWorkflows: vi.fn(),
      fetchFeed: vi.fn().mockRejectedValue(new Error("Feed fetch timed out")),
      now: () => completedAt,
    });

    expect(result).toEqual({
      status: "error",
      fetched: 0,
      created: 0,
      requested: 10,
      error: "Feed fetch timed out",
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastFetchedAt: null,
          lastFetchStartedAt: null,
          lastFetchStatus: "error",
          lastFetchError: "Feed fetch timed out",
        }),
      }),
    );
  });

  it("keeps imported entries when workflow enqueue is temporarily unavailable", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const result = await fetchInitialFeed("user-1", feed, {
      prisma: { feed: { updateMany } },
      entryRepository: {
        upsertSourceByFeedUrl: vi.fn().mockResolvedValue({
          created: true,
          entry: { id: "entry-1", version: 1 },
        }),
      },
      enqueueWorkflows: vi.fn().mockRejectedValue(new Error("AiRun unavailable")),
      fetchFeed: vi.fn().mockResolvedValue([
        { title: "One", url: "https://example.com/one", content: "Body" },
      ]),
    });
    expect(result.status).toBe("success");
    expect(result.created).toBe(1);
  });
});
