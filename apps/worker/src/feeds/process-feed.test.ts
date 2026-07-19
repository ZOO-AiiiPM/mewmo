import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  processFeed,
  selectUnseenFeedEntries,
  type FeedCronRecord,
} from "./process-feed";

const startedAt = new Date("2026-07-16T00:10:00.000Z");
const feed: FeedCronRecord = {
  id: "feed-1",
  userId: "user-1",
  url: "https://example.com/feed.xml",
  title: "Example Feed",
  lastFetchedAt: new Date("2026-07-16T00:00:00.000Z"),
  lastFetchStatus: "success",
  lastFetchStartedAt: null,
  lastSeenEntryUrl: "https://example.com/old",
};

describe("processFeed", () => {
  const updateMany = vi.fn();
  const upsertSourceByFeedUrl = vi.fn();
  const enqueueFeedEntryProcess = vi.fn();
  const fetchFeed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    fetchFeed.mockResolvedValue([
      {
        title: "New RSS title",
        url: "https://example.com/new",
        content: "New RSS body",
        excerpt: "New RSS description",
        publishedAt: new Date("2026-07-16T00:05:00.000Z"),
      },
      {
        title: "Old RSS title",
        url: "https://example.com/old",
        content: "Old RSS body",
        publishedAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    ]);
    upsertSourceByFeedUrl.mockResolvedValue({
      created: true,
      entry: { id: "entry-1" },
    });
    enqueueFeedEntryProcess.mockResolvedValue({ id: "job-1" });
  });

  function dependencies() {
    return {
      prisma: { feed: { updateMany } },
      entryRepository: { upsertSourceByFeedUrl },
      jobsRepository: { enqueueFeedEntryProcess },
      fetchFeed,
      now: () => startedAt,
    };
  }

  it("imports only entries before the saved cursor and creates PostgreSQL jobs", async () => {
    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({
      status: "success",
      upserted: 1,
      created: 1,
      failed: 0,
    });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledTimes(1);
    expect(upsertSourceByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "New RSS title",
        url: "https://example.com/new",
        content: "New RSS body",
      }),
    );
    expect(enqueueFeedEntryProcess).toHaveBeenCalledWith(
      "user-1",
      "entry-1",
      expect.objectContaining({
        title: "New RSS title",
        content: "New RSS body",
      }),
    );
  });

  it("processes every newly published entry instead of a fixed ten", async () => {
    const newEntries = Array.from({ length: 12 }, (_, index) => ({
      title: `New ${index}`,
      url: `https://example.com/new-${index}`,
      content: `Body ${index}`,
      publishedAt: new Date(
        `2026-07-16T00:${String(index + 1).padStart(2, "0")}:00.000Z`,
      ),
    }));
    fetchFeed.mockResolvedValue([
      ...newEntries,
      {
        title: "Old",
        url: feed.lastSeenEntryUrl,
        content: "Old body",
        publishedAt: new Date("2026-07-15T00:00:00Z"),
      },
    ]);
    upsertSourceByFeedUrl.mockImplementation(
      async (_userId, input: { url: string }) => ({
        created: true,
        entry: { id: input.url },
      }),
    );

    const result = await processFeed(feed, dependencies());

    expect(result).toEqual({
      status: "success",
      upserted: 12,
      created: 12,
      failed: 0,
    });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledTimes(12);
    expect(enqueueFeedEntryProcess).toHaveBeenCalledTimes(12);
  });

  it("does not backfill old history when the cursor disappeared from the feed", () => {
    const entries = [
      {
        title: "New",
        url: "https://example.com/new",
        content: "",
        publishedAt: new Date("2026-07-16T00:01:00Z"),
      },
      {
        title: "Old",
        url: "https://example.com/old-2",
        content: "",
        publishedAt: new Date("2026-07-15T00:00:00Z"),
      },
    ];

    expect(
      selectUnseenFeedEntries(entries, feed).map((entry) => entry.title),
    ).toEqual(["New"]);
    expect(
      selectUnseenFeedEntries(entries, {
        lastSeenEntryUrl: "missing",
        lastFetchedAt: null,
      }),
    ).toEqual([]);
  });

  it("claims the observed lease and clears it after completion", async () => {
    await processFeed(feed, dependencies());

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          lastFetchStatus: "success",
          lastFetchStartedAt: null,
        }),
        data: expect.objectContaining({
          lastFetchStatus: "fetching",
          lastFetchStartedAt: startedAt,
        }),
      }),
    );
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastFetchedAt: startedAt,
          lastFetchStartedAt: null,
          lastFetchStatus: "success",
          lastSeenEntryUrl: "https://example.com/new",
        }),
      }),
    );
  });

  it("skips when another process already claimed the feed", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(processFeed(feed, dependencies())).resolves.toEqual({
      status: "skipped",
      reason: "already_claimed",
      upserted: 0,
      created: 0,
      failed: 0,
    });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("records a feed-level error for a failed RSS request", async () => {
    fetchFeed.mockRejectedValueOnce(new Error("Feed fetch timed out"));
    const result = await processFeed(feed, dependencies());
    expect(result).toEqual({
      status: "error",
      upserted: 0,
      created: 0,
      failed: 1,
      error: "Feed fetch timed out",
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastFetchStartedAt: null,
          lastFetchStatus: "error",
          lastFetchError: "Feed fetch timed out",
        }),
      }),
    );
  });
});
