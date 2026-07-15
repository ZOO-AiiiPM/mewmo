import { describe, expect, it, vi } from "vitest";

import { runFeedCron } from "./run-feed-cron";

describe("runFeedCron", () => {
  it("continues after failures and reports the whole bounded batch", async () => {
    const feeds = [
      { id: "feed-1", userId: "user-1", url: "https://example.com/one.xml", title: "One", lastFetchStatus: "queued", lastFetchStartedAt: null },
      { id: "feed-2", userId: "user-1", url: "https://example.com/two.xml", title: "Two", lastFetchStatus: "queued", lastFetchStartedAt: null },
      { id: "feed-3", userId: "user-1", url: "https://example.com/three.xml", title: "Three", lastFetchStatus: "queued", lastFetchStartedAt: null },
      { id: "feed-4", userId: "user-1", url: "https://example.com/four.xml", title: "Four", lastFetchStatus: "queued", lastFetchStartedAt: null },
    ];
    const findDueForRefresh = vi.fn().mockResolvedValue(feeds);
    const processFeed = vi.fn()
      .mockResolvedValueOnce({ status: "error" })
      .mockResolvedValueOnce({ status: "success" })
      .mockResolvedValueOnce({ status: "partial" })
      .mockResolvedValueOnce({ status: "skipped" });

    const result = await runFeedCron({
      feedsRepository: { findDueForRefresh },
      processFeed,
      now: new Date("2026-07-16T00:10:00.000Z"),
    });

    expect(findDueForRefresh).toHaveBeenCalledWith(new Date("2026-07-16T00:10:00.000Z"), 50);
    expect(processFeed).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ selected: 4, succeeded: 1, partial: 1, failed: 1, skipped: 1 });
  });

  it("counts an unexpected processor rejection and continues", async () => {
    const findDueForRefresh = vi.fn().mockResolvedValue([
      { id: "feed-1" },
      { id: "feed-2" },
    ]);
    const processFeed = vi.fn()
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockResolvedValueOnce({ status: "success" });

    const result = await runFeedCron({ feedsRepository: { findDueForRefresh }, processFeed });

    expect(result).toEqual({ selected: 2, succeeded: 1, partial: 0, failed: 1, skipped: 0 });
  });
});
