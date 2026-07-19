import { describe, expect, it, vi } from "vitest";

import { createBackgroundJobsRepository } from "./background-jobs";

describe("background jobs repository", () => {
  it("deduplicates the first-import retry separately from article processing", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-initial" });
    const repository = createBackgroundJobsRepository({ backgroundJob: { upsert } });

    await repository.enqueueInitialFeedImport("user-1", "feed-1", 5);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { type_dedupeKey: { type: "feed_initial_import", dedupeKey: "feed-initial:feed-1" } },
      create: expect.objectContaining({
        type: "feed_initial_import",
        payload: { userId: "user-1", feedId: "feed-1", limit: 5 },
      }),
    }));
  });

  it("deduplicates feed entry work by entry id", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-1" });
    const repository = createBackgroundJobsRepository({
      backgroundJob: { upsert },
    });

    await repository.enqueueFeedEntryProcess("user-1", "entry-1", {
      title: "RSS title",
      url: "https://example.com/one",
      content: "RSS body",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        type_dedupeKey: {
          type: "feed_entry_process",
          dedupeKey: "feed-entry:entry-1",
        },
      },
      create: {
        type: "feed_entry_process",
        dedupeKey: "feed-entry:entry-1",
        payload: {
          userId: "user-1",
          entryId: "entry-1",
          rss: {
            title: "RSS title",
            url: "https://example.com/one",
            content: "RSS body",
          },
        },
        userId: "user-1",
      },
      update: {},
    });
  });

  it("claims an expired job with a five-minute database lease", async () => {
    const now = new Date("2026-07-16T00:00:00Z");
    const lockedUntil = new Date("2026-07-16T00:05:00Z");
    const candidate = { id: "job-1", status: "pending", lockedUntil: null };
    const claimed = {
      ...candidate,
      type: "feed_entry_process",
      payload: {},
      status: "running",
      lockedUntil,
      attempts: 1,
      maxAttempts: 3,
      userId: "user-1",
    };
    const findFirst = vi.fn().mockResolvedValue(candidate);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue(claimed);
    const repository = createBackgroundJobsRepository({
      backgroundJob: { findFirst, updateMany, findUnique },
    });

    await expect(repository.claimNext(now)).resolves.toEqual(claimed);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "pending", runAt: { lte: now } },
      data: {
        status: "running",
        lockedUntil,
        lastError: null,
        finishedAt: null,
        attempts: { increment: 1 },
      },
    });
  });

  it("returns failed work to pending until the third attempt", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = createBackgroundJobsRepository({
      backgroundJob: { updateMany },
    });
    const now = new Date("2026-07-16T00:00:00Z");
    const job = {
      id: "job-1",
      type: "feed_entry_process" as const,
      payload: {},
      status: "running" as const,
      lockedUntil: new Date("2026-07-16T00:05:00Z"),
      attempts: 1,
      maxAttempts: 3,
      userId: "user-1",
    };

    await repository.fail(job, "AI unavailable", now);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          lockedUntil: null,
          lastError: "AI unavailable",
          runAt: new Date("2026-07-16T00:00:02Z"),
        }),
      }),
    );
  });
});
