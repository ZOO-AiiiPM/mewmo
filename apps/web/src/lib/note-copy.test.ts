import { describe, expect, it, vi } from "vitest";

import {
  buildNoteCopyMarkdown,
  copyNoteMarkdownToClipboard,
} from "./note-copy";

describe("note copy markdown", () => {
  it("copies one title and stable paragraph spacing", () => {
    expect(
      buildNoteCopyMarkdown({
        title: "你好",
        markdown: "测试\n\n<br />\n\n\n测试中",
      }),
    ).toBe("# 你好\n\n测试\n\n测试中");
  });

  it("keeps markdown syntax and converts inline breaks to hard breaks", () => {
    expect(
      buildNoteCopyMarkdown({
        title: "格式测试",
        markdown: "正文含 **重点**<br>下一行",
      }),
    ).toBe("# 格式测试\n\n正文含 **重点**  \n下一行");
  });

  it("copies an empty note title", () => {
    expect(buildNoteCopyMarkdown({ title: "空笔记", markdown: "" })).toBe(
      "# 空笔记",
    );
  });
});

describe("note markdown clipboard writer", () => {
  it("uses writeText only", async () => {
    const write = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    const clipboard = { write, writeText };

    await copyNoteMarkdownToClipboard("# 标题", clipboard);

    expect(writeText).toHaveBeenCalledWith("# 标题");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects clipboard failures", async () => {
    await expect(
      copyNoteMarkdownToClipboard("# 标题", {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).rejects.toThrow("denied");
  });
});
