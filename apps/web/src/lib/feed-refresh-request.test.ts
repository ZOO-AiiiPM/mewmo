import { describe, expect, it, vi } from "vitest";

import { requestFeedRefresh } from "./feed-refresh-request";

describe("requestFeedRefresh", () => {
  it("marks a feed queued without creating a Redis job", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const result = await requestFeedRefresh("user-1", "feed-1", {
      prisma: { feed: { updateMany, findFirst: vi.fn() } },
    });

    expect(result).toEqual({ queued: true, status: "queued" });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: { not: "fetching" },
      },
      data: {
        lastFetchStatus: "queued",
        lastFetchStartedAt: null,
        lastFetchError: null,
        version: { increment: 1 },
      },
    });
  });

  it("preserves a feed already owned by a running Cron", async () => {
    const result = await requestFeedRefresh("user-1", "feed-1", {
      prisma: {
        feed: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue({ lastFetchStatus: "fetching" }),
        },
      },
    });

    expect(result).toEqual({ queued: true, status: "fetching" });
  });
});
