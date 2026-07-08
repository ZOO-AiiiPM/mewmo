import { describe, expect, it } from "vitest";

import { shouldSaveMarkdownUpdate } from "../../apps/web/src/components/editor/markdown-save";

describe("editor markdown save gating", () => {
  it("skips the first Crepe normalization event when content is unchanged", () => {
    expect(
      shouldSaveMarkdownUpdate({
        ready: false,
        initialContent: "",
        markdown: "\n",
        prevMarkdown: "",
      }),
    ).toBe(false);
  });

  it("skips the first Crepe normalization event for existing formatted notes", () => {
    expect(
      shouldSaveMarkdownUpdate({
        ready: false,
        initialContent: `
| 保持 |  |  |
| --- | --- | --- |
| 但是 |  |  |

- [x] 测试但这是
`,
        markdown: `
| 保持 |     |     |
| ---- | --- | --- |
| 但是 |     |     |

- [x] 测试但这是
`,
        prevMarkdown: "",
      }),
    ).toBe(false);
  });

  it("saves the first user edit when an empty note receives pasted image markdown", () => {
    expect(
      shouldSaveMarkdownUpdate({
        ready: false,
        initialContent: "",
        markdown: "![image](data:image/png;base64,abc)",
        prevMarkdown: "",
      }),
    ).toBe(true);
  });

  it("saves ordinary updates after the editor is ready", () => {
    expect(
      shouldSaveMarkdownUpdate({
        ready: true,
        initialContent: "",
        markdown: "正文",
        prevMarkdown: "",
      }),
    ).toBe(true);
  });
});
