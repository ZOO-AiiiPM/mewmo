import { describe, expect, it, vi } from "vitest";

import { DEFAULT_FEED_FETCH_LIMIT, fetchAndStoreFeed } from "./feed-fetch-service";

describe("fetchAndStoreFeed", () => {
  it("stores at most the latest 10 parsed entries by default", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      title: "Example Feed",
      favicon: null,
    };
    const items = Array.from({ length: 12 }, (_, index) => {
      const n = index + 1;
      return `<item><title>Post ${n}</title><link>https://example.com/${n}</link><description>Body ${n}</description></item>`;
    }).join("");
    const feedFindFirst = vi.fn().mockResolvedValue(feed);
    const feedUpdate = vi.fn().mockResolvedValue({});
    const upsertByFeedUrl = vi.fn().mockImplementation(async (_userId, input) => ({
      created: true,
      entry: { id: input.url },
    }));

    const result = await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: { findFirst: feedFindFirst, update: feedUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () => new Response(`<rss><channel>${items}</channel></rss>`),
      fetchEntryPage: async (url) => ({
        title: `Full ${url}`,
        content: `<article><p>Full body for ${url}</p></article>`,
      }),
    });

    expect(DEFAULT_FEED_FETCH_LIMIT).toBe(10);
    expect(result).toMatchObject({ status: "ok", fetched: 10, created: 10 });
    expect(upsertByFeedUrl).toHaveBeenCalledTimes(10);
    expect(upsertByFeedUrl).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: "Post 11" }));
  });

  it("sorts an unordered feed by published time before taking ten entries", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      title: "Example Feed",
      favicon: null,
    };
    const items = Array.from({ length: 11 }, (_, index) => {
      const day = index + 1;
      return `<item><title>Post ${day}</title><link>https://example.com/${day}</link><pubDate>2026-07-${String(day).padStart(2, "0")}T00:00:00Z</pubDate></item>`;
    }).join("");
    const upsertByFeedUrl = vi.fn().mockResolvedValue({ created: false, entry: {} });

    await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue(feed),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () => new Response(`<rss><channel>${items}</channel></rss>`),
      fetchEntryPage: async (url) => ({ title: url, content: "<p>body</p>" }),
    });

    expect(upsertByFeedUrl.mock.calls.map((call) => call[1].url)).toEqual(
      Array.from({ length: 10 }, (_, index) => `https://example.com/${11 - index}`),
    );
  });

  it("skips the fetch when another runtime already claimed the feed", async () => {
    const fetchFeed = vi.fn();

    const result = await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue({
            id: "feed-1",
            userId: "user-1",
            url: "https://example.com/feed.xml",
            title: "Example Feed",
          }),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
      fetchFeed,
    });

    expect(result).toMatchObject({ status: "skipped", reason: "already_claimed" });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("claims only an error state for the queue-failure Web fallback", async () => {
    const startedAt = new Date("2026-07-13T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue({
            id: "feed-1",
            userId: "user-1",
            url: "https://example.com/feed.xml",
            title: "Example Feed",
          }),
          update: vi.fn(),
          updateMany,
        },
      },
      claimStatuses: ["error"],
      allowStaleTakeover: false,
      now: () => startedAt,
      fetchFeed: async () => new Response("<rss><channel></channel></rss>"),
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: { in: ["error"] },
      },
      data: expect.objectContaining({
        lastFetchStartedAt: startedAt,
        lastFetchStatus: "fetching",
      }),
    });
  });

  it("does not let a stale owner overwrite a newer successful fetch", async () => {
    const startedAt = new Date("2026-07-13T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const result = await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue({
            id: "feed-1",
            userId: "user-1",
            url: "https://example.com/feed.xml",
            title: "Example Feed",
          }),
          update: vi.fn(),
          updateMany,
        },
      },
      now: () => startedAt,
      fetchFeed: async () => new Response("<rss><channel></channel></rss>"),
    });

    expect(result).toMatchObject({ status: "skipped", reason: "lease_lost" });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: expect.objectContaining({ lastFetchStatus: "success" }),
    });
  });

  it("does not let a stale owner overwrite a newer fetch with an error", async () => {
    const startedAt = new Date("2026-07-13T00:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const result = await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue({
            id: "feed-1",
            userId: "user-1",
            url: "https://example.com/feed.xml",
            title: "Example Feed",
          }),
          update: vi.fn(),
          updateMany,
        },
      },
      now: () => startedAt,
      fetchFeed: async () => new Response("unavailable", { status: 503 }),
    });

    expect(result).toMatchObject({ status: "skipped", reason: "lease_lost" });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "feed-1",
        userId: "user-1",
        deletedAt: null,
        lastFetchStatus: "fetching",
        lastFetchStartedAt: startedAt,
      },
      data: expect.objectContaining({ lastFetchStatus: "error" }),
    });
  });

  it("continues storing later entries when one entry fails", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      title: "Example Feed",
      favicon: null,
    };
    const feedUpdate = vi.fn().mockResolvedValue({});
    const feedUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsertByFeedUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error("first entry failed"))
      .mockResolvedValueOnce({ created: true, entry: { id: "entry-2" } });

    const result = await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: {
          findFirst: vi.fn().mockResolvedValue(feed),
          update: feedUpdate,
          updateMany: feedUpdateMany,
        },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () =>
        new Response(`
        <rss><channel>
          <item><title>One</title><link>https://example.com/one</link></item>
          <item><title>Two</title><link>https://example.com/two</link></item>
        </channel></rss>
      `),
      fetchEntryPage: async () => ({ title: "Article", content: "<p>body</p>" }),
    });

    expect(upsertByFeedUrl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "partial",
      fetched: 2,
      created: 1,
      failed: 1,
    });
    expect(feedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "feed-1", userId: "user-1", deletedAt: null, lastFetchStatus: "fetching", lastFetchStartedAt: expect.any(Date) },
      data: {
        lastFetchedAt: expect.any(Date),
        lastFetchStatus: "partial",
        lastFetchError: "first entry failed",
        lastFetchCount: 1,
        version: { increment: 1 },
      },
    });
  });

  it("uses the original article page content instead of RSS summary when available", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      title: "Example Feed",
      favicon: null,
    };
    const feedFindFirst = vi.fn().mockResolvedValue(feed);
    const feedUpdate = vi.fn().mockResolvedValue({});
    const upsertByFeedUrl = vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } });

    await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: { findFirst: feedFindFirst, update: feedUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () =>
        new Response(`
          <rss><channel>
            <item>
              <title>RSS title</title>
              <link>https://example.com/post</link>
              <description>RSS summary &lt;a href="https://example.com/post"&gt;查看全文&lt;/a&gt;</description>
            </item>
          </channel></rss>
        `),
      fetchEntryPage: async () => ({
        title: "Original title",
        content: "<article><p>Original full body.</p></article>",
        summary: "Original summary",
        coverImage: "https://example.com/cover.jpg",
        sourceName: "Original Site",
        author: "Author",
      }),
    });

    expect(upsertByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Original title",
        content: "<article><p>Original full body.</p></article>",
        summary: "Original summary",
        coverImage: "https://example.com/cover.jpg",
        sourceName: "Original Site",
        author: "Author",
      }),
    );
  });

  it("keeps the feed title when the article page title only adds a site suffix", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://sspai.com/feed",
      title: "少数派",
      favicon: null,
    };
    const feedFindFirst = vi.fn().mockResolvedValue(feed);
    const feedUpdate = vi.fn().mockResolvedValue({});
    const upsertByFeedUrl = vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } });

    await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: { findFirst: feedFindFirst, update: feedUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () =>
        new Response(`
          <rss><channel>
            <item>
              <title>自动给文章术语加百科链接，这个方案一分钟搞定</title>
              <link>https://sspai.com/post/111702</link>
              <description>RSS summary</description>
            </item>
          </channel></rss>
        `),
      fetchEntryPage: async () => ({
        title: "自动给文章术语加百科链接，这个方案一分钟搞定 - 少数派",
        content: "<article><p>Original full body.</p></article>",
      }),
    });

    expect(upsertByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "自动给文章术语加百科链接，这个方案一分钟搞定",
      }),
    );
  });

  it("cleans numeric HTML entity separators before removing a site title suffix", async () => {
    const feed = {
      id: "feed-1",
      userId: "user-1",
      url: "https://www.woshipm.com/feed",
      title: "人人都是产品经理",
      favicon: null,
    };
    const feedFindFirst = vi.fn().mockResolvedValue(feed);
    const feedUpdate = vi.fn().mockResolvedValue({});
    const upsertByFeedUrl = vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } });

    await fetchAndStoreFeed("user-1", "feed-1", {
      prisma: {
        feed: { findFirst: feedFindFirst, update: feedUpdate, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
      entryRepository: { upsertByFeedUrl },
      fetchFeed: async () =>
        new Response(`
          <rss><channel>
            <item>
              <title>世界杯双雄品牌战，可口vs百事、阿迪vs耐克、蒙牛vs伊利</title>
              <link>https://www.woshipm.com/share/6425497.html</link>
              <description>RSS summary</description>
            </item>
          </channel></rss>
        `),
      fetchEntryPage: async () => ({
        title: "世界杯双雄品牌战，可口vs百事、阿迪vs耐克、蒙牛vs伊利 &#8211; 人人都是产品经理",
        content: "<article><p>Original full body.</p></article>",
      }),
    });

    expect(upsertByFeedUrl).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "世界杯双雄品牌战，可口vs百事、阿迪vs耐克、蒙牛vs伊利",
      }),
    );
  });
});
