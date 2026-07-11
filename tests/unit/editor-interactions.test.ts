import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  blockStylePointerDidClick,
  getBlockStyleMenuCheckSvg,
  getBlockStyleMenuIconSvg,
  getBlockStyleMenuItems,
  getBlockStyleMenuItemKeys,
  getBlockStyleMenuPosition,
  resolveBlockStyleKey,
  resolveBlockStyleMenuAction,
  shouldOpenBlockStyleMenuFromHandle,
  shouldOpenInsertMenuAtCurrentEmptyBlock,
  shouldBlockEmptyAddHandleInsert,
  shouldLiftBlockquoteFormat,
  isBlockStyleHandleTarget,
  isEmptyAddHandleTarget,
  shouldClearEmptyHeadingFormat,
  shouldBlockSelectionDrag,
  shouldJoinFormattedBlockWithPrevious,
  shouldOpenBlockStyleMenuForNode,
} from "../../apps/web/src/components/editor/editor-interactions";

describe("editor interactions", () => {
  it("blocks browser dragging only while text is selected", () => {
    expect(shouldBlockSelectionDrag({ empty: false })).toBe(true);
    expect(shouldBlockSelectionDrag({ empty: true })).toBe(false);
    expect(shouldBlockSelectionDrag({ empty: false }, false)).toBe(false);
  });

  it("detects clicks on the empty-line add handle", () => {
    const matchingTarget = {
      closest: (selector: string) =>
        selector === ".milkdown-block-handle[data-mewmo-mode=\"add\"] .operation-item:first-child" ? {} : null,
    } as unknown as EventTarget;
    const otherTarget = {
      closest: () => null,
    } as unknown as EventTarget;

    expect(isEmptyAddHandleTarget(matchingTarget)).toBe(true);
    expect(isEmptyAddHandleTarget(otherTarget)).toBe(false);
    expect(isEmptyAddHandleTarget(null)).toBe(false);
  });

  it("detects clicks on the filled-line block style handle", () => {
    const matchingTarget = {
      closest: (selector: string) =>
        selector === ".milkdown-block-handle[data-mewmo-mode=\"drag\"] .operation-item:nth-child(2)" ? {} : null,
    } as unknown as EventTarget;
    const otherTarget = {
      closest: () => null,
    } as unknown as EventTarget;

    expect(isBlockStyleHandleTarget(matchingTarget)).toBe(true);
    expect(isBlockStyleHandleTarget(otherTarget)).toBe(false);
    expect(isBlockStyleHandleTarget(null)).toBe(false);
  });

  it("opens the block style menu for writable text blocks and code blocks", () => {
    expect(shouldOpenBlockStyleMenuForNode("paragraph", true)).toBe(true);
    expect(shouldOpenBlockStyleMenuForNode("heading", true)).toBe(true);
    expect(shouldOpenBlockStyleMenuForNode("code_block", false)).toBe(true);
    expect(shouldOpenBlockStyleMenuForNode("table", false)).toBe(true);
    expect(shouldOpenBlockStyleMenuForNode("blockquote", true)).toBe(false);
    expect(shouldOpenBlockStyleMenuForNode("paragraph", false)).toBe(false);
  });

  it("offers only style commands that can preserve the current line content", () => {
    expect(getBlockStyleMenuItemKeys()).toEqual([
      "text",
      "h1",
      "h2",
      "quote",
      "bullet-list",
      "ordered-list",
      "task-list",
      "code",
      "table",
    ]);
  });

  it("adds icons to every block style command and marks the current style separately", () => {
    expect(getBlockStyleMenuItems()).toEqual([
      { key: "text", label: "Text", icon: "text" },
      { key: "h1", label: "Heading 1", icon: "h1" },
      { key: "h2", label: "Heading 2", icon: "h2" },
      { key: "quote", label: "Quote", icon: "quote" },
      { key: "bullet-list", label: "Bullet List", icon: "bullet-list" },
      { key: "ordered-list", label: "Numbered List", icon: "ordered-list" },
      { key: "task-list", label: "To-do", icon: "task-list" },
      { key: "code", label: "Code", icon: "code" },
      { key: "table", label: "Table", icon: "table" },
    ]);
  });

  it("renders block style menu icons as inline svg instead of text glyphs", () => {
    for (const item of getBlockStyleMenuItems()) {
      expect(getBlockStyleMenuIconSvg(item.icon)).toContain("<svg");
      expect(getBlockStyleMenuIconSvg(item.icon)).toContain("currentColor");
    }
  });

  it("renders the active block style check as an inline svg instead of a text glyph", () => {
    expect(getBlockStyleMenuCheckSvg()).toContain("<svg");
    expect(getBlockStyleMenuCheckSvg()).toContain("currentColor");
  });

  it("keeps the block style popup inside the viewport when opened near an edge", () => {
    expect(
      getBlockStyleMenuPosition({
        left: 790,
        top: 590,
        menuWidth: 218,
        menuHeight: 260,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 574, top: 332 });
  });

  it("opens the block style menu only for a short click, not for a drag gesture", () => {
    expect(blockStylePointerDidClick({ x: 100, y: 100 }, { x: 102, y: 103 })).toBe(true);
    expect(blockStylePointerDidClick({ x: 100, y: 100 }, { x: 113, y: 100 })).toBe(false);
    expect(blockStylePointerDidClick({ x: 100, y: 100 }, { x: 100, y: 113 })).toBe(false);
  });

  it("keeps the empty-line add handle on the insert menu instead of the style menu", () => {
    const addTarget = {
      closest: (selector: string) =>
        selector === ".milkdown-block-handle[data-mewmo-mode=\"add\"] .operation-item:first-child" ? {} : null,
    } as unknown as EventTarget;
    const styleTarget = {
      closest: (selector: string) =>
        selector === ".milkdown-block-handle[data-mewmo-mode=\"drag\"] .operation-item:nth-child(2)" ? {} : null,
    } as unknown as EventTarget;

    expect(shouldOpenBlockStyleMenuFromHandle(addTarget, addTarget)).toBe(false);
    expect(shouldOpenBlockStyleMenuFromHandle(styleTarget, styleTarget)).toBe(true);
  });

  it("opens the insert menu on the current empty block instead of inserting another blank block", () => {
    const addTarget = {
      closest: (selector: string) =>
        selector === ".milkdown-block-handle[data-mewmo-mode=\"add\"] .operation-item:first-child" ? {} : null,
    } as unknown as EventTarget;

    expect(shouldOpenInsertMenuAtCurrentEmptyBlock(addTarget, addTarget, true)).toBe(true);
    expect(shouldOpenInsertMenuAtCurrentEmptyBlock(addTarget, addTarget, false)).toBe(false);
  });

  it("toggles the current block style back to text and normalizes heading before list styles", () => {
    expect(resolveBlockStyleMenuAction("h1", "h1")).toEqual({
      key: "text",
      normalizeToTextFirst: false,
    });
    expect(resolveBlockStyleMenuAction("h2", "ordered-list")).toEqual({
      key: "ordered-list",
      normalizeToTextFirst: true,
    });
    expect(resolveBlockStyleMenuAction("h1", "task-list")).toEqual({
      key: "task-list",
      normalizeToTextFirst: true,
    });
  });

  it("resolves the current block style from nested editor nodes", () => {
    expect(resolveBlockStyleKey([{ typeName: "paragraph" }])).toBe("text");
    expect(resolveBlockStyleKey([{ typeName: "heading", attrs: { level: 1 } }])).toBe("h1");
    expect(resolveBlockStyleKey([{ typeName: "heading", attrs: { level: 2 } }])).toBe("h2");
    expect(resolveBlockStyleKey([{ typeName: "blockquote" }, { typeName: "paragraph" }])).toBe("quote");
    expect(resolveBlockStyleKey([{ typeName: "bullet_list" }, { typeName: "list_item" }, { typeName: "paragraph" }])).toBe("bullet-list");
    expect(resolveBlockStyleKey([{ typeName: "ordered_list" }, { typeName: "list_item" }, { typeName: "paragraph" }])).toBe("ordered-list");
    expect(resolveBlockStyleKey([{ typeName: "bullet_list" }, { typeName: "list_item", attrs: { checked: false } }, { typeName: "paragraph" }])).toBe("task-list");
    expect(resolveBlockStyleKey([{ typeName: "code_block" }])).toBe("code");
    expect(resolveBlockStyleKey([{ typeName: "table" }, { typeName: "table_row" }, { typeName: "table_cell" }, { typeName: "paragraph" }])).toBe("table");
  });

  it("replaces selected structural blocks instead of formatting a nested table cell", () => {
    const source = readFileSync("apps/web/src/components/editor/editor-interactions.ts", "utf8");

    expect(source).toContain("NodeSelection");
    expect(source).toContain("replaceSelectionWith");
    expect(source).toContain("createTable");
  });

  it("clears heading format directly when an empty heading receives Backspace", () => {
    expect(shouldClearEmptyHeadingFormat("heading", 0, true)).toBe(true);
    expect(shouldClearEmptyHeadingFormat("heading", 1, true)).toBe(false);
    expect(shouldClearEmptyHeadingFormat("paragraph", 0, true)).toBe(false);
    expect(shouldClearEmptyHeadingFormat("heading", 0, false)).toBe(false);
  });

  it("blocks Crepe's transient empty paragraph insert when the empty add handle opens the slash menu", () => {
    expect(
      shouldBlockEmptyAddHandleInsert({
        pendingAddHandle: true,
        transactionChangedDocument: true,
        selectedNodeTypeName: "paragraph",
        selectedNodeText: "",
      }),
    ).toBe(true);
    expect(
      shouldBlockEmptyAddHandleInsert({
        pendingAddHandle: false,
        transactionChangedDocument: true,
        selectedNodeTypeName: "paragraph",
        selectedNodeText: "",
      }),
    ).toBe(false);
    expect(
      shouldBlockEmptyAddHandleInsert({
        pendingAddHandle: true,
        transactionChangedDocument: true,
        selectedNodeTypeName: "paragraph",
        selectedNodeText: "written",
      }),
    ).toBe(false);
  });

  it("lifts quote formatting before deleting quote content", () => {
    expect(shouldLiftBlockquoteFormat(["blockquote", "paragraph"], 0, true)).toBe(true);
    expect(shouldLiftBlockquoteFormat(["blockquote", "paragraph"], 1, true)).toBe(true);
    expect(shouldLiftBlockquoteFormat(["blockquote", "paragraph"], 2, true)).toBe(false);
    expect(shouldLiftBlockquoteFormat(["paragraph"], 0, true)).toBe(false);
    expect(shouldLiftBlockquoteFormat(["blockquote", "paragraph"], 0, false)).toBe(false);
  });

  it("joins any non-empty markdown block with the previous text block before removing its format", () => {
    expect(shouldJoinFormattedBlockWithPrevious(["heading"], 0, 2, true, true)).toBe(true);
    expect(shouldJoinFormattedBlockWithPrevious(["blockquote", "paragraph"], 0, 2, true, true)).toBe(true);
    expect(shouldJoinFormattedBlockWithPrevious(["bullet_list", "list_item", "paragraph"], 0, 2, true, true)).toBe(true);
    expect(shouldJoinFormattedBlockWithPrevious(["code_block"], 0, 2, true, true)).toBe(true);
    expect(shouldJoinFormattedBlockWithPrevious(["paragraph"], 0, 2, true, true)).toBe(false);
    expect(shouldJoinFormattedBlockWithPrevious(["heading"], 1, 2, true, true)).toBe(false);
    expect(shouldJoinFormattedBlockWithPrevious(["heading"], 0, 0, true, true)).toBe(false);
    expect(shouldJoinFormattedBlockWithPrevious(["heading"], 0, 2, false, true)).toBe(false);
    expect(shouldJoinFormattedBlockWithPrevious(["heading"], 0, 2, true, false)).toBe(false);
  });
});
