import { describe, expect, it, vi } from "vitest";

import { processInitialFeedImportJob } from "./process-initial-feed-import-job";

describe("processInitialFeedImportJob", () => {
  it("retries the selected first history independently from Cron", async () => {
    const startedAt = new Date("2026-07-16T00:00:00Z");
    const findFirst = vi.fn().mockResolvedValue({
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      title: "Example Feed",
      lastFetchedAt: null,
      lastSeenEntryUrl: null,
      lastFetchStatus: "error",
      lastFetchStartedAt: null,
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsertSourceByFeedUrl = vi
      .fn()
      .mockImplementation(async (_userId, input: { url: string }) => ({
        created: true,
        entry: { id: input.url },
      }));
    const enqueueFeedEntryProcess = vi.fn().mockResolvedValue({ id: "job" });
    const entries = Array.from({ length: 12 }, (_, index) => ({
      title: `Entry ${index + 1}`,
      url: `https://example.com/${index + 1}`,
      content: `Body ${index + 1}`,
    }));

    const result = await processInitialFeedImportJob(
      { userId: "user-1", feedId: "feed-1", limit: 5 },
      {
        prisma: { feed: { findFirst, updateMany } },
        fetchFeed: vi.fn().mockResolvedValue(entries),
        entryRepository: { upsertSourceByFeedUrl },
        jobsRepository: { enqueueFeedEntryProcess },
        now: () => startedAt,
      },
    );

    expect(result).toEqual({ status: "ok", fetched: 5, created: 5 });
    expect(upsertSourceByFeedUrl).toHaveBeenCalledTimes(5);
    expect(enqueueFeedEntryProcess).toHaveBeenCalledTimes(5);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastFetchedAt: startedAt,
        lastFetchStatus: "success",
        lastSeenEntryUrl: "https://example.com/1",
      }),
    }));
  });
});
