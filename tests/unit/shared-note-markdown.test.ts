import { describe, expect, it } from "vitest";

import {
  buildSharedNoteListTree,
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
          { children: [{ type: "text", value: "第一项" }], depth: 0 },
          { children: [{ type: "text", value: "第二项" }], depth: 0 },
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

  it("parses thematic breaks into divider blocks", () => {
    expect(parseSharedNoteMarkdown("上文\n\n---\n\n下文")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "上文" }] },
      { type: "divider" },
      { type: "paragraph", children: [{ type: "text", value: "下文" }] },
    ]);
    expect(parseSharedNoteMarkdown("***")).toEqual([{ type: "divider" }]);
    // A divider directly after list items must not be swallowed by the list.
    expect(parseSharedNoteMarkdown("- 项\n---")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [{ children: [{ type: "text", value: "项" }], depth: 0 }],
      },
      { type: "divider" },
    ]);
  });

  it("records nesting depth for indented list items", () => {
    expect(parseSharedNoteMarkdown("- 父项\n  - 子项\n    - 孙项\n- 兄弟")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { children: [{ type: "text", value: "父项" }], depth: 0 },
          { children: [{ type: "text", value: "子项" }], depth: 1 },
          { children: [{ type: "text", value: "孙项" }], depth: 2 },
          { children: [{ type: "text", value: "兄弟" }], depth: 0 },
        ],
      },
    ]);
  });

  it("parses strikethrough inline spans", () => {
    expect(parseSharedNoteMarkdown("已~~废弃~~内容")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "已" },
          { type: "strikethrough", children: [{ type: "text", value: "废弃" }] },
          { type: "text", value: "内容" },
        ],
      },
    ]);
  });

  it("parses task list items with checked state", () => {
    expect(parseSharedNoteMarkdown("- [ ] 待办\n- [x] 已完成")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { children: [{ type: "text", value: "待办" }], depth: 0, task: "unchecked" },
          { children: [{ type: "text", value: "已完成" }], depth: 0, task: "checked" },
        ],
      },
    ]);
  });

  it("folds flat depth-annotated items into a nested tree", () => {
    const blocks = parseSharedNoteMarkdown("- a\n  - b\n  - c\n- d");
    const list = blocks[0];
    if (list?.type !== "list") throw new Error("expected list block");
    const tree = buildSharedNoteListTree(list.items);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.item.children).toEqual([{ type: "text", value: "a" }]);
    expect(tree[0]?.children.map((node) => node.item.children)).toEqual([
      [{ type: "text", value: "b" }],
      [{ type: "text", value: "c" }],
    ]);
    expect(tree[1]?.item.children).toEqual([{ type: "text", value: "d" }]);
    expect(tree[1]?.children).toEqual([]);
  });
});
