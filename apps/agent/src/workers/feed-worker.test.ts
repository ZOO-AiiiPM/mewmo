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

const feedXml = `
  <rss><channel>
    <item><title>One</title><link>https://example.com/one</link><description>One body</description></item>
    <item><title>Two</title><link>https://example.com/two</link><description>Two body</description></item>
  </channel></rss>
`;

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

  it("records fetching and success status while upserting entries incrementally", async () => {
    upsertByFeedUrl.mockResolvedValueOnce({ created: true, entry: { id: "entry-1" } }).mockResolvedValueOnce({ created: false, entry: { id: "entry-2" } });

    const result = await processFeedFetchJob(
      { feedId: "feed-1" },
      {
        connection: {},
        fetchFeed: async () => new Response(feedXml),
      },
    );

    expect(result).toMatchObject({
      status: "success",
      upserted: 2,
      created: 1,
      failed: 0,
    });
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(2);
    expect(addSummaryJob).toHaveBeenCalledTimes(1);
    expect(addTagJob).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: "feed-1" },
      data: {
        lastFetchStartedAt: expect.any(Date),
        lastFetchStatus: "fetching",
        lastFetchError: null,
        version: { increment: 1 },
      },
    });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "feed-1" },
      data: {
        lastFetchedAt: expect.any(Date),
        lastFetchStatus: "success",
        lastFetchError: null,
        lastFetchCount: 1,
        version: { increment: 1 },
      },
    });
  });

  it("continues after one entry fails, records partial status, and rejects for BullMQ retry", async () => {
    upsertByFeedUrl.mockRejectedValueOnce(new Error("entry write failed")).mockResolvedValueOnce({ created: true, entry: { id: "entry-2" } });

    await expect(processFeedFetchJob({ feedId: "feed-1" }, { connection: {}, fetchFeed: async () => new Response(feedXml) })).rejects.toThrow(
      "1 feed entry failed",
    );

    expect(upsertByFeedUrl).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "feed-1" },
      data: {
        lastFetchedAt: expect.any(Date),
        lastFetchStatus: "partial",
        lastFetchError: "entry write failed",
        lastFetchCount: 1,
        version: { increment: 1 },
      },
    });
  });

  it("records feed-level errors before rejecting for retry", async () => {
    await expect(processFeedFetchJob({ feedId: "feed-1" }, { fetchFeed: async () => new Response("unavailable", { status: 503 }) })).rejects.toThrow(
      "Feed fetch failed",
    );

    expect(update).toHaveBeenLastCalledWith({
      where: { id: "feed-1" },
      data: {
        lastFetchStatus: "error",
        lastFetchError: expect.stringContaining("503"),
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
  });

  it("stores at most the latest ten entries from one fetch", async () => {
    const items = Array.from({ length: 11 }, (_, index) => `<item><title>Entry ${index}</title><link>https://example.com/${index}</link></item>`).join("");
    upsertByFeedUrl.mockResolvedValue({ created: false, entry: {} });

    const result = await processFeedFetchJob(
      { feedId: "feed-1" },
      {
        fetchFeed: async () => new Response(`<rss><channel>${items}</channel></rss>`),
      },
    );

    expect(result).toMatchObject({ status: "success", upserted: 10 });
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(10);
  });
});
