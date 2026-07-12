import { beforeEach, describe, expect, it, vi } from "vitest";

import { processFeedFetchJob } from "./feed-worker";

const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const upsertByFeedUrl = vi.fn();
const addSummaryJob = vi.fn();
const addTagJob = vi.fn();

vi.mock("@mewmo/db", () => ({
  getPrisma: () => ({
    feed: { findFirst, update, updateMany },
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
  withTimeout: async (operation: Promise<unknown>, timeoutMs: number, message: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
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
      lastFetchStatus: "queued",
    });
    update.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 1 });
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
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "feed-1" }),
      data: {
        lastFetchStartedAt: expect.any(Date),
        lastFetchStatus: "fetching",
        lastFetchError: null,
        version: { increment: 1 },
      },
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "feed-1", deletedAt: null, lastFetchStatus: "fetching", lastFetchStartedAt: expect.any(Date) },
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
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "feed-1", deletedAt: null, lastFetchStatus: "fetching", lastFetchStartedAt: expect.any(Date) },
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

    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: "feed-1", deletedAt: null, lastFetchStatus: "fetching", lastFetchStartedAt: expect.any(Date) },
      data: {
        lastFetchStatus: "error",
        lastFetchError: expect.stringContaining("503"),
        lastFetchCount: 0,
        version: { increment: 1 },
      },
    });
  });

  it("stores at most the latest ten entries from one fetch", async () => {
    const items = Array.from({ length: 11 }, (_, index) => {
      const day = index + 1;
      return `<item><title>Entry ${day}</title><link>https://example.com/${day}</link><pubDate>2026-07-${String(day).padStart(2, "0")}T00:00:00Z</pubDate></item>`;
    }).join("");
    upsertByFeedUrl.mockResolvedValue({ created: false, entry: {} });

    const result = await processFeedFetchJob(
      { feedId: "feed-1" },
      {
        fetchFeed: async () => new Response(`<rss><channel>${items}</channel></rss>`),
      },
    );

    expect(result).toMatchObject({ status: "success", upserted: 10 });
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(10);
    expect(upsertByFeedUrl.mock.calls.map((call) => call[1].url)).toEqual(
      Array.from({ length: 10 }, (_, index) => `https://example.com/${11 - index}`),
    );
  });

  it("skips work when another fetcher already claimed the feed", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const fetchFeed = vi.fn();

    const result = await processFeedFetchJob({ feedId: "feed-1" }, { fetchFeed });

    expect(result).toMatchObject({ status: "skipped", reason: "already_claimed" });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("does not let a stale worker overwrite a newer successful fetch", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    upsertByFeedUrl.mockResolvedValue({ created: false, entry: {} });

    const result = await processFeedFetchJob({ feedId: "feed-1" }, { fetchFeed: async () => new Response(feedXml) });

    expect(result).toMatchObject({ status: "skipped", reason: "lease_lost" });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "feed-1",
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: expect.any(Date),
      },
      data: expect.objectContaining({ lastFetchStatus: "success" }),
    });
  });

  it("does not let a stale worker overwrite a newer fetch with an error", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const result = await processFeedFetchJob(
      { feedId: "feed-1" },
      { fetchFeed: async () => new Response("unavailable", { status: 503 }) },
    );

    expect(result).toMatchObject({ status: "skipped", reason: "lease_lost" });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "feed-1",
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: expect.any(Date),
      },
      data: expect.objectContaining({ lastFetchStatus: "error" }),
    });
  });

  it("passes an abort signal to feed requests", async () => {
    const fetchFeed = vi.fn(async () => new Response(feedXml));
    upsertByFeedUrl.mockResolvedValue({ created: false, entry: {} });

    await processFeedFetchJob({ feedId: "feed-1" }, { fetchFeed });

    expect(fetchFeed).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("bounds a feed request that never settles", async () => {
    vi.useFakeTimers();
    const fetchFeed = vi.fn(() => new Promise<Response>(() => {}));
    const observed = processFeedFetchJob({ feedId: "feed-1" }, { fetchFeed }).then(
      () => "resolved",
      () => "rejected",
    );

    await vi.advanceTimersByTimeAsync(15_000);

    expect(await Promise.race([observed, Promise.resolve("pending")])).toBe("rejected");
    vi.useRealTimers();
  });

  it("bounds post-processing queue calls and continues to later entries", async () => {
    vi.useFakeTimers();
    upsertByFeedUrl
      .mockResolvedValueOnce({ created: true, entry: { id: "entry-1" } })
      .mockResolvedValueOnce({ created: true, entry: { id: "entry-2" } });
    addSummaryJob.mockImplementationOnce(() => new Promise(() => {}));
    const observed = processFeedFetchJob(
      { feedId: "feed-1" },
      { connection: {}, fetchFeed: async () => new Response(feedXml) },
    ).then(
      () => "resolved",
      () => "rejected",
    );

    await vi.advanceTimersByTimeAsync(3_000);
    await vi.runAllTimersAsync();

    expect(await Promise.race([observed, Promise.resolve("pending")])).toBe("rejected");
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(2);
    expect(addTagJob).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("requeues post-processing on a partial retry even when the entry already exists", async () => {
    findFirst.mockResolvedValueOnce({
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      lastFetchStatus: "partial",
    });
    upsertByFeedUrl.mockResolvedValue({ created: false, entry: { id: "entry-existing" } });

    await processFeedFetchJob(
      { feedId: "feed-1" },
      { connection: {}, fetchFeed: async () => new Response(feedXml) },
    );

    expect(addSummaryJob).toHaveBeenCalled();
    expect(addTagJob).toHaveBeenCalled();
  });
});
