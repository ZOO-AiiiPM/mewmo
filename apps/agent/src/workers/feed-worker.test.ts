import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeedFetchJob } from "./feed-worker";

const findFirst = vi.fn();
const update = vi.fn();
const upsertByFeedUrl = vi.fn();
const addSummaryJob = vi.fn();
const addTagJob = vi.fn();

vi.mock("@mewmo/db", () => ({
  getPrisma: () => ({
    feed: { findFirst, update },
  }),
  createFeedEntriesRepository: () => ({
    upsertByFeedUrl,
  }),
}));

vi.mock("@mewmo/queue", () => ({
  createMewmoQueues: () => ({}),
  createQueueHelpers: () => ({ addSummaryJob, addTagJob }),
  createRedisConnection: () => ({}),
  queueNames: { feedFetch: "feed-fetch-queue" },
}));

describe("processFeedFetchJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
    });
    update.mockResolvedValue({});
  });

  it("upserts parsed entries and only enqueues new entries", async () => {
    upsertByFeedUrl
      .mockResolvedValueOnce({ created: true, entry: { id: "entry-1" } })
      .mockResolvedValueOnce({ created: false, entry: { id: "entry-2" } });

    const result = await processFeedFetchJob(
      { feedId: "feed-1" },
      {
        connection: {},
        fetchFeed: async () =>
          new Response(`
            <rss><channel>
              <item><title>One</title><link>https://example.com/one</link><description>One body</description></item>
              <item><title>Two</title><link>https://example.com/two</link><description>Two body</description></item>
            </channel></rss>
          `),
      },
    );

    expect(result).toMatchObject({ status: "ok", upserted: 2, created: 1 });
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(2);
    expect(addSummaryJob).toHaveBeenCalledTimes(1);
    expect(addTagJob).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "feed-1" },
      data: { lastFetchedAt: expect.any(Date), version: { increment: 1 } },
    });
  });
});
