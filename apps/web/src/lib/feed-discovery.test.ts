import { describe, expect, it, vi } from "vitest";

import { discoverFeeds } from "./feed-discovery";

function htmlResponse(html: string, _url = "https://example.com") {
  return new Response(html, {
    headers: { "content-type": "text/html" },
    status: 200,
  }) as Response & { url: string };
}

function xmlResponse(xml: string, _url = "https://example.com/feed.xml") {
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml" },
    status: 200,
  }) as Response & { url: string };
}

describe("discoverFeeds", () => {
  it("recognizes direct RSS URLs", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(
      xmlResponse("<rss><channel><title>Example RSS</title><description>Daily notes</description></channel></rss>"),
    );

    await expect(discoverFeeds("https://example.com/feed.xml", { fetchFeed })).resolves.toEqual([
      expect.objectContaining({
        title: "Example RSS",
        url: "https://example.com/feed.xml",
        type: "article",
        sourceKind: "RSS 源",
      }),
    ]);
  });

  it("reads the site favicon when discovering a direct RSS URL", async () => {
    const fetchFeed = vi
      .fn()
      .mockResolvedValueOnce(
        xmlResponse(
          "<rss><channel><title>Example RSS</title><link>https://example.com</link></channel></rss>",
        ),
      )
      .mockResolvedValueOnce(
        htmlResponse('<link rel="icon" href="https://cdn.example.com/icon.ico">', "https://example.com"),
      );

    await expect(discoverFeeds("https://example.com/feed.xml", { fetchFeed })).resolves.toEqual([
      expect.objectContaining({
        favicon: "https://cdn.example.com/icon.ico",
      }),
    ]);
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });

  it("discovers alternate feed links from a website", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(
      htmlResponse(`
        <html>
          <head>
            <title>Example Site</title>
            <link rel="alternate" type="application/rss+xml" title="Example Feed" href="/rss.xml">
          </head>
        </html>
      `),
    );

    await expect(discoverFeeds("https://example.com", { fetchFeed })).resolves.toEqual([
      expect.objectContaining({
        title: "Example Feed",
        url: "https://example.com/rss.xml",
        siteUrl: "https://example.com",
        sourceKind: "网站 · 自动发现源",
      }),
    ]);
  });

  it("decodes numeric entities in direct feed titles", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(
      xmlResponse(
        "<rss><channel><title>产品设计 &#8211; 人人都是产品经理 &#x2014; 精选</title></channel></rss>",
      ),
    );

    const [feed] = await discoverFeeds("https://example.com/feed.xml", { fetchFeed });

    expect(feed?.title).toBe("产品设计 – 人人都是产品经理 — 精选");
  });

  it("decodes named entities in direct feed titles", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(
      xmlResponse(
        "<rss><channel><title>产品设计&nbsp;&ndash;&nbsp;精选 &mdash; 每日更新</title></channel></rss>",
      ),
    );

    const [feed] = await discoverFeeds("https://example.com/feed.xml", { fetchFeed });

    expect(feed?.title).toBe("产品设计 – 精选 — 每日更新");
  });

  it("decodes numeric entities in website feed-link titles", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(
      htmlResponse(
        '<link rel="alternate" type="application/rss+xml" title="产品运营 &#8211; 精选" href="/feed.xml">',
      ),
    );

    const [feed] = await discoverFeeds("https://example.com", { fetchFeed });

    expect(feed?.title).toBe("产品运营 – 精选");
  });

  it("uses a configured search provider for keywords", async () => {
    const fetchFeed = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ title: "晚点 LatePost", url: "https://www.latepost.com", description: "Business media" }],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        htmlResponse('<link rel="alternate" type="application/rss+xml" title="晚点 RSS" href="/feed.xml">', "https://www.latepost.com"),
      );

    const results = await discoverFeeds("晚点", {
      fetchFeed,
      searchEndpoint: "https://search.example.test",
      searchApiKey: "key",
    });

    expect(results).toEqual([
      expect.objectContaining({
        title: "晚点 RSS",
        url: "https://www.latepost.com/feed.xml",
        type: "media",
      }),
    ]);
  });

  it("requires a real search provider for keyword discovery", async () => {
    await expect(discoverFeeds("少数派", { fetchFeed: vi.fn() })).rejects.toThrow(
      "Feed search provider is not configured",
    );
  });
});
