import { describe, expect, it } from "vitest";

import { normalizeFeedEntryContent } from "./feed-content";

describe("normalizeFeedEntryContent", () => {
  it("keeps WeChat rich body, lazy images, excerpt, and cover while removing duplicate title", () => {
    const normalized = normalizeFeedEntryContent({
      title: "微信文章标题",
      url: "https://mp.weixin.qq.com/s/demo",
      content: `
        <div id="js_content">
          <h1 class="rich_media_title">微信文章标题</h1>
          <p style="color: rgb(117, 117, 117); font-size: 16px">正文第一段</p>
          <img data-src="https://mmbiz.qpic.cn/cover.png" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
        </div>
      `,
    });

    expect(normalized.content).not.toContain("rich_media_title");
    expect(normalized.content).toContain("正文第一段");
    expect(normalized.coverImage).toBe("https://mmbiz.qpic.cn/cover.png");
    expect(normalized.excerpt).toContain("正文第一段");
  });
});
