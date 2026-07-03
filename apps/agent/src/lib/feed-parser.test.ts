import { describe, expect, it } from "vitest";

import { parseFeedXml } from "./feed-parser";

describe("parseFeedXml", () => {
  it("normalizes RSS items", () => {
    const entries = parseFeedXml(`
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Example RSS</title>
          <item>
            <title>RSS Item</title>
            <link>https://example.com/rss-item</link>
            <description>Short RSS summary</description>
            <content:encoded><![CDATA[<p>Full RSS content</p>]]></content:encoded>
            <author>writer@example.com</author>
            <pubDate>Fri, 03 Jul 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: "RSS Item",
      url: "https://example.com/rss-item",
      content: "<p>Full RSS content</p>",
      summary: "Short RSS summary",
      author: "writer@example.com",
    });
    expect(entries[0]?.publishedAt?.toISOString()).toBe("2026-07-03T10:00:00.000Z");
  });

  it("normalizes Atom entries", () => {
    const entries = parseFeedXml(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Example Atom</title>
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

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: "Atom Entry",
      url: "https://example.com/atom-entry",
      content: "<p>Atom content</p>",
      summary: "Atom summary",
      author: "Atom Author",
    });
    expect(entries[0]?.publishedAt?.toISOString()).toBe("2026-07-03T11:30:00.000Z");
  });
});
