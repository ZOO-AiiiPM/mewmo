import { describe, expect, it } from "vitest";

import {
  parseSharedNoteMarkdown,
} from "../../apps/web/src/lib/shared-note-markdown";

describe("shared note markdown", () => {
  it("parses common note markdown into structured read-only blocks", () => {
    expect(
      parseSharedNoteMarkdown(`# 标题

正文含有 **重点**、*斜体* 和 [链接](https://example.com)。

- 第一项
- 第二项

> 引用内容

\`\`\`ts
const value = 1;
\`\`\``),
    ).toEqual([
      { type: "heading", level: 1, children: [{ type: "text", value: "标题" }] },
      {
        type: "paragraph",
        children: [
          { type: "text", value: "正文含有 " },
          { type: "strong", children: [{ type: "text", value: "重点" }] },
          { type: "text", value: "、" },
          { type: "emphasis", children: [{ type: "text", value: "斜体" }] },
          { type: "text", value: " 和 " },
          {
            type: "link",
            href: "https://example.com",
            children: [{ type: "text", value: "链接" }],
          },
          { type: "text", value: "。" },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", value: "第一项" }],
          [{ type: "text", value: "第二项" }],
        ],
      },
      { type: "blockquote", children: [{ type: "text", value: "引用内容" }] },
      { type: "code", language: "ts", code: "const value = 1;" },
    ]);
  });

  it("keeps raw html as text instead of executable markup", () => {
    expect(parseSharedNoteMarkdown("<script>alert(1)</script>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "<script>alert(1)</script>" }],
      },
    ]);
  });
});
