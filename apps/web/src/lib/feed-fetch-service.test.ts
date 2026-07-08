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
        feed: { findFirst: feedFindFirst, update: feedUpdate },
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
    expect(upsertByFeedUrl).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "Post 11" }),
    );
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
        feed: { findFirst: feedFindFirst, update: feedUpdate },
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
        feed: { findFirst: feedFindFirst, update: feedUpdate },
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
        feed: { findFirst: feedFindFirst, update: feedUpdate },
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
