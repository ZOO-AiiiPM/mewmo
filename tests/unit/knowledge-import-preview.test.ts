import { describe, expect, it } from "vitest";

import { formatKnowledgeImportPreviewParagraphs } from "../../apps/web/src/lib/knowledge-import-preview";

describe("knowledge import preview", () => {
  it("removes markdown and html control characters from preview paragraphs", () => {
    expect(
      formatKnowledgeImportPreviewParagraphs(
        [
          "# 标题",
          "**重点** 内容<br />下一行",
          "| 字段 | 值 |",
          "| --- | --- |",
          "| 状态 | `done` |",
          "- [x] 已完成",
        ].join("\n"),
      ),
    ).toEqual(["标题", "重点 内容", "下一行", "字段 值", "状态 done", "已完成"]);
  });

  it("falls back to a clean source URL when content is empty", () => {
    expect(formatKnowledgeImportPreviewParagraphs("", "https://example.com/a?b=1")).toEqual([
      "https://example.com/a?b=1",
    ]);
  });
});
