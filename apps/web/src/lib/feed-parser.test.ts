import { describe, expect, it } from "vitest";

import { parseFeedXml } from "./feed-parser";

describe("parseFeedXml", () => {
  it("decodes escaped HTML attributes inside RSS content", () => {
    const [entry] = parseFeedXml(`
      <rss><channel>
        <item>
          <title>One</title>
          <link>https://example.com/one</link>
          <description>&lt;a href=&#34;https://example.com/one&#34;&gt;阅读全文&lt;/a&gt;</description>
        </item>
      </channel></rss>
    `);

    expect(entry?.content).toContain('<a href="https://example.com/one">');
  });
});
