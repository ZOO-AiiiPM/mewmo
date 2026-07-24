import { describe, expect, it } from "vitest";

import {
  buildNoteCardTitle,
  buildNoteMetadataItems,
  contentTags,
  extractNoteImages,
  formatUpdatedRelative,
  formatNoteListTime,
  noteWordCount,
  notePreviewText,
} from "../../apps/web/src/lib/note-list-preview";

describe("note list preview", () => {
  it("does not add a default tag when content has no matching topic", () => {
    expect(
      contentTags({ title: "Untitled", summary: null, content: "" }),
    ).toEqual([]);
  });

  it("uses note content for the preview text when summary is empty", () => {
    expect(
      notePreviewText({
        summary: null,
        content:
          "# Title\n\n####Subtitle\n\n不是把 AI 做成助手图标，<br />而是让它像桌上真的趴着一只猫。",
      }),
    ).toBe("不是把 AI 做成助手图标，而是让它像桌上真的趴着一只猫。");
  });

  it("flattens paragraph breaks into a flowing preview and prefers note text over summaries", () => {
    expect(
      notePreviewText({
        summary: "AI 生成的摘要",
        content: "第一段原文\n\n第二段原文",
      }),
    ).toBe("第一段原文 第二段原文");
  });

  it("filters markdown thematic breaks from note previews", () => {
    expect(
      notePreviewText({
        summary: null,
        content: "整理日期：2026-01-19\n\n---\n\n正文预览",
      }),
    ).toBe("整理日期：2026-01-19 正文预览");
  });

  it("filters markdown table syntax from preview text", () => {
    expect(
      notePreviewText({
        summary: null,
        content:
          "| | | | | |\n|:-----|:-----|:-----|\n| | | |\n\nThis is a test note with bold and italic text.\n\n==这是高亮==",
      }),
    ).toBe("This is a test note with bold and italic text. 这是高亮");
  });

  it("limits list previews to 240 characters", () => {
    expect(
      Array.from(notePreviewText({ summary: null, content: "猫".repeat(300) })),
    ).toHaveLength(240);
  });

  it("filters filled markdown table rows from preview text", () => {
    expect(
      notePreviewText({
        summary: null,
        content:
          "| 保持 | | | | |\n| 但是 | | | | |\n| [x] 测试 | 但这是 | 但是 | 但是这个 | 不过 |\n\n表格后面的正文",
      }),
    ).toBe("表格后面的正文");
  });

  it("builds visible metadata from update time and word count", () => {
    expect(
      formatUpdatedRelative(
        "2026-07-06T02:42:00.000Z",
        new Date("2026-07-06T03:00:00.000Z"),
      ),
    ).toBe("18 分钟前");
    expect(noteWordCount("This is a test note\n产品定位")).toBe(9);
  });

  it("formats note card time like clip cards from created time", () => {
    expect(
      formatNoteListTime(
        "2026-07-06T02:42:00.000Z",
        new Date("2026-07-06T03:00:00.000Z"),
      ),
    ).toBe("10:42");
    expect(
      formatNoteListTime(
        "2026-07-05T02:42:00.000Z",
        new Date("2026-07-06T03:00:00.000Z"),
      ),
    ).toBe("昨天 10:42");
  });

  it("builds editor metadata from update time and tags", () => {
    expect(
      buildNoteMetadataItems(
        {
          title: "AI 产品定位",
          summary: null,
          content: "This is a test note\n产品定位",
          createdAt: "2026-07-05T03:00:00.000Z",
          updatedAt: "2026-07-06T02:42:00.000Z",
        },
        new Date("2026-07-06T03:00:00.000Z"),
      ),
    ).toEqual({
      details: ["18 分钟前"],
      tags: ["产品", "AI"],
    });
  });

  it("extracts markdown and html images from note content", () => {
    expect(
      extractNoteImages(
        '![cover](https://example.com/a.png)\n<img src="/uploads/b.jpg" alt="b" />',
      ),
    ).toEqual(["https://example.com/a.png", "/uploads/b.jpg"]);
  });

  it("includes metadata in the card title", () => {
    expect(
      buildNoteCardTitle({
        title: "2.0 数据层验收清单",
        updatedAt: "2026-07-06T02:00:00.000Z",
        createdAt: "2026-07-05T02:00:00.000Z",
        tags: ["数据层", "产品"],
        preview: "db / auth / queue",
      }),
    ).toContain("修改：");
    expect(
      buildNoteCardTitle({
        title: "2.0 数据层验收清单",
        updatedAt: "2026-07-06T02:00:00.000Z",
        createdAt: "2026-07-05T02:00:00.000Z",
        tags: ["数据层", "产品"],
        preview: "db / auth / queue",
      }),
    ).toContain("创建：");
  });
});
