import { describe, expect, it, vi } from "vitest";

import { fetchFeedDocument, parseFeedXml } from "./feed";

describe("parseFeedXml", () => {
  it("maps RSS descriptions to excerpt without creating an AI summary", () => {
    const [entry] = parseFeedXml(`
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel><item>
          <title>RSS Item</title>
          <link>https://example.com/rss-item</link>
          <description>Short RSS summary</description>
          <content:encoded><![CDATA[<p>Full RSS content</p>]]></content:encoded>
          <author>writer@example.com</author>
          <pubDate>Fri, 03 Jul 2026 10:00:00 GMT</pubDate>
        </item></channel>
      </rss>
    `);

    expect(entry).toMatchObject({
      title: "RSS Item",
      url: "https://example.com/rss-item",
      content: "<p>Full RSS content</p>",
      excerpt: "Short RSS summary",
      author: "writer@example.com",
    });
    expect(entry).not.toHaveProperty("summary");
    expect(entry?.publishedAt?.toISOString()).toBe("2026-07-03T10:00:00.000Z");
  });

  it("maps Atom summaries to excerpt without creating an AI summary", () => {
    const [entry] = parseFeedXml(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom Entry</title>
          <link href="https://example.com/atom-entry" rel="alternate" />
          <summary>Atom summary</summary>
          <content type="html">&lt;p&gt;Atom content&lt;/p&gt;</content>
          <author><name>Atom Author</name></author>
          <updated>2026-07-03T11:30:00Z</updated>
        </entry>
      </feed>
    `);

    expect(entry).toMatchObject({
      title: "Atom Entry",
      url: "https://example.com/atom-entry",
      content: "<p>Atom content</p>",
      excerpt: "Atom summary",
      author: "Atom Author",
    });
    expect(entry).not.toHaveProperty("summary");
  });

  it("decodes escaped HTML attributes inside RSS content", () => {
    const [entry] = parseFeedXml(`
      <rss><channel><item>
        <title>One</title>
        <link>https://example.com/one</link>
        <description>&lt;a href=&#34;https://example.com/one&#34;&gt;阅读全文&lt;/a&gt;</description>
      </item></channel></rss>
    `);

    expect(entry?.content).toContain('<a href="https://example.com/one">');
  });

  it("fetches a feed with a bounded request and parses the response", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(new Response(`
      <rss><channel><item>
        <title>One</title>
        <link>https://example.com/one</link>
        <description>Publisher description</description>
      </item></channel></rss>
    `));

    const entries = await fetchFeedDocument("https://example.com/feed.xml", {
      fetchFeed,
      lookupHost: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
    });

    expect(fetchFeed).toHaveBeenCalledWith(
      new URL("https://example.com/feed.xml"),
      expect.objectContaining({
        redirect: "manual",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ accept: expect.stringContaining("application/rss+xml") }),
      }),
    );
    expect(entries[0]).toMatchObject({ title: "One", excerpt: "Publisher description" });
  });

  it("blocks private feed URLs before issuing a request", async () => {
    const fetchFeed = vi.fn();

    await expect(fetchFeedDocument("http://127.0.0.1/feed.xml", { fetchFeed }))
      .rejects.toThrow("blocked address");
    expect(fetchFeed).not.toHaveBeenCalled();
  });
});
