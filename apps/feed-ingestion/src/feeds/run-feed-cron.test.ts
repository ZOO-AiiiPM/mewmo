import { describe, expect, it, vi } from "vitest";

import { runFeedCron } from "./run-feed-cron";

describe("runFeedCron", () => {
  it("continues after failures and processes the bounded feed batch without Redis", async () => {
    const feeds = ["one", "two", "three", "four"].map((id) => ({
      id: `feed-${id}`,
      userId: "user-1",
      url: `https://example.com/${id}.xml`,
      title: id,
      lastFetchedAt: null,
      lastFetchStatus: "success",
      lastFetchStartedAt: null,
      lastSeenEntryUrl: null,
    }));
    const findDueForRefresh = vi.fn().mockResolvedValue(feeds);
    const processFeed = vi
      .fn()
      .mockResolvedValueOnce({ status: "error" })
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "partial" })
      .mockResolvedValueOnce({ status: "skipped" });

    const result = await runFeedCron({
      feedsRepository: { findDueForRefresh },
      processFeed,
      now: new Date("2026-07-16T00:10:00.000Z"),
    });

    expect(findDueForRefresh).toHaveBeenCalledWith(
      new Date("2026-07-16T00:10:00.000Z"),
      50,
    );
    expect(processFeed).toHaveBeenCalledTimes(4);
    for (const feed of feeds) expect(processFeed).toHaveBeenCalledWith(feed);
    expect(result).toEqual({
      selected: 4,
      succeeded: 1,
      partial: 1,
      failed: 1,
      skipped: 1,
    });
  });

  it("counts an unexpected processor rejection and continues", async () => {
    const findDueForRefresh = vi
      .fn()
      .mockResolvedValue([{ id: "feed-1" }, { id: "feed-2" }]);
    const processFeed = vi
      .fn()
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockResolvedValueOnce({ status: "success" });

    const result = await runFeedCron({
      feedsRepository: { findDueForRefresh },
      processFeed,
    });

    expect(result).toEqual({
      selected: 2,
      succeeded: 1,
      partial: 0,
      failed: 1,
      skipped: 0,
    });
  });

  it("returns immediately when no feeds are due", async () => {
    const processFeed = vi.fn();
    const result = await runFeedCron({
      feedsRepository: { findDueForRefresh: vi.fn().mockResolvedValue([]) },
      processFeed,
    });
    expect(processFeed).not.toHaveBeenCalled();
    expect(result).toEqual({
      selected: 0,
      succeeded: 0,
      partial: 0,
      failed: 0,
      skipped: 0,
    });
  });
});
