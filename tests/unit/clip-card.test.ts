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

  it("preserves plain-text and HTML paragraph breaks for shared list cards", () => {
    expect(
      clipPreviewText({
        url: "https://example.com/plain",
        excerpt: "第一段\n\n第二段",
      }),
    ).toBe("第一段\n第二段");

    expect(
      clipPreviewText({
        url: "https://example.com/html",
        content: "<p>第一段</p><p>第二段<br>第三行</p>",
      }),
    ).toBe("第一段\n第二段\n第三行");
  });

  it("removes markdown thematic breaks without deleting ordinary punctuation", () => {
    for (const marker of ["---", "* * *", "___"]) {
      expect(
        clipPreviewText({
          url: "https://example.com",
          excerpt: `整理日期：2026-01-19\n${marker}\n正文预览`,
        }),
      ).toBe("整理日期：2026-01-19\n正文预览");
    }

    expect(
      clipPreviewText({
        url: "https://example.com",
        excerpt: "npm --version\nrelease_*_notes",
      }),
    ).toBe("npm --version\nrelease_*_notes");
  });

  it("limits shared list previews to 240 characters", () => {
    expect(
      Array.from(
        clipPreviewText({
          url: "https://example.com",
          excerpt: "猫".repeat(300),
        }),
      ),
    ).toHaveLength(240);
  });

  it("removes entity-encoded HTML tags without replacing the source preview with AI summary", () => {
    expect(
      clipPreviewText({
        url: "https://example.com",
        summary: "AI summary must remain a fallback",
        excerpt: "&lt;p&gt;正文第一段&lt;/p&gt;&lt;blockquote&gt;引用内容&lt;/blockquote&gt;",
        content: "",
      }),
    ).toBe("正文第一段\n引用内容");
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
