import { describe, expect, it } from "vitest";

import { clipPreviewText, formatClipListTime } from "../../apps/web/src/lib/clip-card";

describe("clip card helpers", () => {
  const now = new Date("2026-07-06T12:00:00.000+08:00");

  it("uses article body text for the gray preview", () => {
    expect(
      clipPreviewText({
        url: "https://example.com",
        summary: "Saved from example.com",
        excerpt: " 正文第一段，解释真实内容。 ",
        content: "<p>fallback</p>",
      }),
    ).toBe("正文第一段，解释真实内容。");
  });

  it("removes entity-encoded HTML tags without replacing the source preview with AI summary", () => {
    expect(
      clipPreviewText({
        url: "https://example.com",
        summary: "AI summary must remain a fallback",
        excerpt: "&lt;p&gt;正文第一段&lt;/p&gt;&lt;blockquote&gt;引用内容&lt;/blockquote&gt;",
        content: "",
      }),
    ).toBe("正文第一段 引用内容");
  });

  it("formats clip times by recency buckets", () => {
    expect(formatClipListTime("2026-07-06T01:05:00.000+08:00", now)).toBe("01:05");
    expect(formatClipListTime("2026-07-05T22:15:00.000+08:00", now)).toBe("昨天 22:15");
    expect(formatClipListTime("2026-07-03T12:00:00.000+08:00", now)).toBe("3天前");
    expect(formatClipListTime("2026-06-22T12:00:00.000+08:00", now)).toBe("2周前");
    expect(formatClipListTime("2026-05-06T12:00:00.000+08:00", now)).toBe("2个月前");
    expect(formatClipListTime("2025-07-06T12:00:00.000+08:00", now)).toBe("1年前");
  });
});
