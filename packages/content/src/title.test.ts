import { describe, expect, it } from "vitest";

import { normalizeExternalTitle } from "./title";

describe("normalizeExternalTitle", () => {
  it.each([
    ["A &#8211; B", "A – B"],
    ["A &#8221; B", "A ” B"],
    ["A &#x2013; B", "A – B"],
    ["A &amp;#8211; B", "A – B"],
    ["Research &amp; Design", "Research & Design"],
  ])("decodes external title entities in %s", (input, expected) => {
    expect(normalizeExternalTitle(input)).toBe(expected);
  });

  it("removes CDATA, tags, and redundant whitespace without damaging text", () => {
    expect(
      normalizeExternalTitle(" <![CDATA[<b>标题</b>\u00a0 &amp; emoji 🐈 - Notes]]> "),
    ).toBe("标题 & emoji 🐈 - Notes");
    expect(normalizeExternalTitle("&lt;b&gt;Encoded title&lt;/b&gt;")).toBe("Encoded title");
  });

  it("is idempotent and preserves a real ampersand", () => {
    const normalized = normalizeExternalTitle("iOS & iPadOS - 使用指南 🐈");

    expect(normalized).toBe("iOS & iPadOS - 使用指南 🐈");
    expect(normalizeExternalTitle(normalized)).toBe(normalized);
  });

  it("preserves literal comparison symbols that are not HTML tags", () => {
    expect(normalizeExternalTitle("5 < 10 > 3 & 2 < 4")).toBe("5 < 10 > 3 & 2 < 4");
  });
});
