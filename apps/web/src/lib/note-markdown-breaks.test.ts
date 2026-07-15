import { describe, expect, it } from "vitest";

import { normalizeNoteMarkdownBreaks } from "./note-markdown-breaks";

describe("note markdown break normalization", () => {
  it("collapses a standalone legacy break and adjacent blanks to one paragraph boundary", () => {
    expect(
      normalizeNoteMarkdownBreaks("测试\n\n<br />\n\n\n测试中"),
    ).toBe("测试\n\n测试中");
  });

  it("turns inline legacy breaks into markdown hard breaks", () => {
    expect(
      normalizeNoteMarkdownBreaks("第一行<br>第二行<br/>第三行"),
    ).toBe("第一行  \n第二行  \n第三行");
  });

  it("preserves break-like text inside fenced code", () => {
    expect(
      normalizeNoteMarkdownBreaks("```html\n<br />\n```\n\n正文<br />下一行"),
    ).toBe("```html\n<br />\n```\n\n正文  \n下一行");
  });
});
