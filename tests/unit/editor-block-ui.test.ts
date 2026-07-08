import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  getBlockHandleMode,
  getBlockStyleKeyForHandle,
  getMewmoBlockEditConfig,
  shouldRemovePreviousEmptyParagraph,
} from "../../apps/web/src/components/editor/block-ui";

describe("editor block UI", () => {
  it("uses the add handle only for empty plain paragraphs", () => {
    expect(getBlockHandleMode("")).toBe("add");
    expect(getBlockHandleMode("   \n\t")).toBe("add");
    expect(getBlockHandleMode("A written line")).toBe("drag");
    expect(getBlockHandleMode("", { typeName: "heading" })).toBe("drag");
    expect(getBlockHandleMode("", { typeName: "code_block" })).toBe("drag");
    expect(getBlockHandleMode("", { typeName: "paragraph", isStructuralContext: true })).toBe("drag");
  });

  it("stores the active block style on the block handle", () => {
    expect(getBlockStyleKeyForHandle("paragraph")).toBe("text");
    expect(getBlockStyleKeyForHandle("heading", { level: 1 })).toBe("h1");
    expect(getBlockStyleKeyForHandle("heading", { level: 2 })).toBe("h2");
    expect(getBlockStyleKeyForHandle("blockquote")).toBe("quote");
    expect(getBlockStyleKeyForHandle("bullet_list")).toBe("bullet-list");
    expect(getBlockStyleKeyForHandle("ordered_list")).toBe("ordered-list");
    expect(getBlockStyleKeyForHandle("list_item", { checked: false })).toBe("task-list");
    expect(getBlockStyleKeyForHandle("code_block")).toBe("code");
    expect(getBlockStyleKeyForHandle("table")).toBe("table");
  });

  it("preserves intentional blank paragraphs when applying normal block styles", () => {
    expect(
      shouldRemovePreviousEmptyParagraph({
        previousTypeName: "paragraph",
        previousText: "",
        currentTypeName: "heading",
        currentIsCodeOrTable: false,
      }),
    ).toBe(false);
    expect(
      shouldRemovePreviousEmptyParagraph({
        previousTypeName: "paragraph",
        previousText: "",
        currentTypeName: "blockquote",
        currentIsCodeOrTable: false,
      }),
    ).toBe(false);
    expect(
      shouldRemovePreviousEmptyParagraph({
        previousTypeName: "paragraph",
        previousText: "",
        currentTypeName: "code_block",
        currentIsCodeOrTable: true,
      }),
    ).toBe(true);
  });

  it("preserves the editable blank paragraph after inserted structural blocks", () => {
    const source = readFileSync("apps/web/src/components/editor/block-ui.ts", "utf8");

    expect(source).not.toMatch(/isCodeOrTableNode\(previousNode\)[\s\S]{0,220}tr\.delete\(currentBlockStart,\s*currentBlockEnd\)/);
    expect(source).not.toMatch(/tr\.delete\(currentBlockEnd,\s*currentBlockEnd \+ nextNode\.nodeSize\)/);
  });

  it("keeps the slash menu to the common writing blocks", () => {
    const config = getMewmoBlockEditConfig();

    expect(config.textGroup).toMatchObject({
      label: "Text",
      text: { label: "Text" },
      h1: { label: "Heading 1" },
      h2: { label: "Heading 2" },
      h3: null,
      h4: null,
      h5: null,
      h6: null,
      divider: null,
    });
    expect(config.listGroup).toMatchObject({
      label: "List",
      bulletList: { label: "Bullet List" },
      orderedList: { label: "Numbered List" },
      taskList: { label: "To-do" },
    });
    expect(config.advancedGroup).toMatchObject({
      label: "Insert",
      image: null,
      codeBlock: { label: "Code" },
      table: { label: "Table" },
      math: null,
    });
  });
});
