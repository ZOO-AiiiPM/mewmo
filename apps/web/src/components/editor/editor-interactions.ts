import { $prose } from "@milkdown/kit/utils";
import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  headingSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";
import { joinTextblockBackward, lift } from "@milkdown/kit/prose/commands";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import type { Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const emptyAddHandleSelector = ".milkdown-block-handle[data-mewmo-mode=\"add\"] .operation-item:first-child";
const blockStyleHandleSelector = ".milkdown-block-handle[data-mewmo-mode=\"drag\"] .operation-item:nth-child(2)";
const blockHandleSelector = ".milkdown-block-handle";
const editorWrapperSelector = ".crepe-editor-wrapper";
const blockStyleClickDistance = 8;
const blockStyleTargetSelector = [
  ".milkdown-code-block",
  ".milkdown-table-block",
  "table",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
].join(",");

let emptyAddHandlePointerPending = false;
let emptyAddHandlePointerTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const blockStyleMenuItems = [
  { key: "text", label: "Text", icon: "text" },
  { key: "h1", label: "Heading 1", icon: "h1" },
  { key: "h2", label: "Heading 2", icon: "h2" },
  { key: "quote", label: "Quote", icon: "quote" },
  { key: "bullet-list", label: "Bullet List", icon: "bullet-list" },
  { key: "ordered-list", label: "Numbered List", icon: "ordered-list" },
  { key: "task-list", label: "To-do", icon: "task-list" },
  { key: "code", label: "Code", icon: "code" },
  { key: "table", label: "Table", icon: "table" },
] as const;

type BlockStyleMenuItemKey = (typeof blockStyleMenuItems)[number]["key"];
type BlockStyleMenuIcon = (typeof blockStyleMenuItems)[number]["icon"];
type BlockStyleNodePath = Array<{
  typeName: string;
  attrs?: Record<string, unknown> | null;
}>;
interface PointerPoint {
  x: number;
  y: number;
}
interface BlockStyleMenuPositionInput {
  left: number;
  top: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
}
interface BlockStylePointerStart extends PointerPoint {
  target: EventTarget | null;
}
interface EmptyAddHandleInsertState {
  pendingAddHandle: boolean;
  transactionChangedDocument: boolean;
  selectedNodeTypeName: string | null;
  selectedNodeText: string | null;
}
interface CrepeInsertMenuAPI {
  show: (pos: number) => void;
  hide: () => void;
}
interface BlockStyleMenuAction {
  key: BlockStyleMenuItemKey;
  normalizeToTextFirst: boolean;
}
interface BlockStyleMenuTarget {
  position: number;
  currentKey: BlockStyleMenuItemKey;
  selectionType: "node" | "text";
}

export function shouldBlockSelectionDrag(selection: Pick<Selection, "empty">, isTextSelection = true) {
  return isTextSelection && !selection.empty;
}

export function shouldClearEmptyHeadingFormat(parentTypeName: string, parentContentSize: number, selectionEmpty: boolean) {
  return selectionEmpty && parentTypeName === "heading" && parentContentSize === 0;
}

export function shouldJoinFormattedBlockWithPrevious(
  selectionTypePath: string[],
  parentOffset: number,
  parentContentSize: number,
  selectionEmpty: boolean,
  hasPreviousBlock: boolean,
) {
  const formattedBlockTypes = new Set([
    "heading",
    "blockquote",
    "bullet_list",
    "ordered_list",
    "list_item",
    "code_block",
  ]);

  return (
    selectionEmpty &&
    parentOffset === 0 &&
    parentContentSize > 0 &&
    hasPreviousBlock &&
    selectionTypePath.some((typeName) => formattedBlockTypes.has(typeName))
  );
}

export function shouldLiftBlockquoteFormat(
  selectionTypePath: string[],
  parentOffset: number,
  selectionEmpty: boolean,
) {
  return selectionEmpty && parentOffset <= 1 && selectionTypePath.includes("blockquote");
}

export function shouldBlockEmptyAddHandleInsert({
  pendingAddHandle,
  transactionChangedDocument,
  selectedNodeTypeName,
  selectedNodeText,
}: EmptyAddHandleInsertState) {
  return (
    pendingAddHandle &&
    transactionChangedDocument &&
    selectedNodeTypeName === "paragraph" &&
    !selectedNodeText?.trim()
  );
}

function hasClosest(target: EventTarget | null): target is EventTarget & { closest: (selector: string) => unknown } {
  return typeof (target as { closest?: unknown } | null)?.closest === "function";
}

export function isEmptyAddHandleTarget(target: EventTarget | null) {
  return hasClosest(target) && Boolean(target.closest(emptyAddHandleSelector));
}

export function isBlockStyleHandleTarget(target: EventTarget | null) {
  return hasClosest(target) && Boolean(target.closest(blockStyleHandleSelector));
}

export function shouldOpenBlockStyleMenuForNode(nodeTypeName: string, isTextblock: boolean) {
  if (nodeTypeName === "table") return true;
  if (nodeTypeName === "code_block") return true;
  return isTextblock && (nodeTypeName === "paragraph" || nodeTypeName === "heading");
}

export function shouldOpenBlockStyleMenuFromHandle(
  startTarget: EventTarget | null,
  endTarget: EventTarget | null,
) {
  if (isEmptyAddHandleTarget(startTarget) || isEmptyAddHandleTarget(endTarget)) return false;
  return isBlockStyleHandleTarget(startTarget) || isBlockStyleHandleTarget(endTarget);
}

export function shouldOpenInsertMenuAtCurrentEmptyBlock(
  startTarget: EventTarget | null,
  endTarget: EventTarget | null,
  didClick: boolean,
) {
  return didClick && (isEmptyAddHandleTarget(startTarget) || isEmptyAddHandleTarget(endTarget));
}

export function getBlockStyleMenuItemKeys() {
  return blockStyleMenuItems.map((item) => item.key);
}

export function getBlockStyleMenuItems() {
  return blockStyleMenuItems.map((item) => ({ ...item }));
}

export function getBlockStyleMenuIconSvg(icon: BlockStyleMenuIcon) {
  const icons: Record<BlockStyleMenuIcon, string> = {
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5.75A.75.75 0 0 1 5.75 5h12.5a.75.75 0 0 1 0 1.5H13v11.75a.75.75 0 0 1-1.5 0V6.5H5.75A.75.75 0 0 1 5 5.75Z"/></svg>',
    h1: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.75 5a.75.75 0 0 1 .75.75V11h6V5.75a.75.75 0 0 1 1.5 0v12.5a.75.75 0 0 1-1.5 0V12.5h-6v5.75a.75.75 0 0 1-1.5 0V5.75A.75.75 0 0 1 4.75 5Zm12.75 3.5a.75.75 0 0 1 .75.75v8.25h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5V10.8l-1.06.7a.75.75 0 1 1-.83-1.25l2.22-1.48a.75.75 0 0 1 .42-.13Z"/></svg>',
    h2: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.75 5a.75.75 0 0 1 .75.75V11h6V5.75a.75.75 0 0 1 1.5 0v12.5a.75.75 0 0 1-1.5 0V12.5h-6v5.75a.75.75 0 0 1-1.5 0V5.75A.75.75 0 0 1 4.75 5Zm11.5 5.5a2.75 2.75 0 1 1 4.4 2.2l-2.86 2.15a1.25 1.25 0 0 0-.5.9h3.46a.75.75 0 0 1 0 1.5H16.5a.75.75 0 0 1-.75-.75v-.5a2.75 2.75 0 0 1 1.1-2.2l2.9-2.18a1.25 1.25 0 1 0-2-1 .75.75 0 0 1-1.5 0Z"/></svg>',
    quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.4 6.25a.75.75 0 0 1 .72.96L7.95 11.2h1.3A2.75 2.75 0 0 1 12 13.95v1.3A2.75 2.75 0 0 1 9.25 18h-1.5A2.75 2.75 0 0 1 5 15.25v-3.1c0-.8.18-1.59.53-2.31l1.58-3.17a.75.75 0 0 1 .67-.42h.62Zm8 0a.75.75 0 0 1 .72.96l-1.17 3.99h1.3A2.75 2.75 0 0 1 20 13.95v1.3A2.75 2.75 0 0 1 17.25 18h-1.5A2.75 2.75 0 0 1 13 15.25v-3.1c0-.8.18-1.59.53-2.31l1.58-3.17a.75.75 0 0 1 .67-.42h.62Z"/></svg>',
    "bullet-list": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.5 8a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Zm3-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1 0-1.5Zm0 8h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1 0-1.5ZM5 17a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3Z"/></svg>',
    "ordered-list": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.25 5.25A.75.75 0 0 1 6 6v4a.75.75 0 0 1-1.5 0V7.2l-.3.2a.75.75 0 0 1-.83-1.25l1.47-.98a.75.75 0 0 1 .41-.12Zm4.25 2h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1 0-1.5Zm0 8h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1 0-1.5ZM3.5 14.75A2.25 2.25 0 1 1 7.1 16.55l-1.6 1.2H7a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75v-.25c0-.7.33-1.36.9-1.78l2.05-1.54a.75.75 0 1 0-1.2-.6a.75.75 0 0 1-1.5 0Z"/></svg>',
    "task-list": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.78 6.22a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06 0l-1.5-1.5a.75.75 0 0 1 1.06-1.06l.97.97l2.47-2.47a.75.75 0 0 1 1.06 0ZM10.5 7.25h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5Zm0 8h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5ZM4 14.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75H4a.75.75 0 0 1-.75-.75v-3a.75.75 0 0 1 .75-.75Zm.75 1.5v1.5h1.5v-1.5h-1.5Z"/></svg>',
    code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.03 7.47a.75.75 0 0 1 0 1.06L5.56 12l3.47 3.47a.75.75 0 1 1-1.06 1.06l-4-4a.75.75 0 0 1 0-1.06l4-4a.75.75 0 0 1 1.06 0Zm5.94 0a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L18.44 12l-3.47-3.47a.75.75 0 0 1 0-1.06Z"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.75 4.5h14.5A1.75 1.75 0 0 1 21 6.25v11.5a1.75 1.75 0 0 1-1.75 1.75H4.75A1.75 1.75 0 0 1 3 17.75V6.25A1.75 1.75 0 0 1 4.75 4.5Zm-.25 5v3h5v-3h-5Zm6.5 0v3h8.5v-3H11Zm8.5-1.5V6.25a.25.25 0 0 0-.25-.25H11v2h8.5ZM9.5 6H4.75a.25.25 0 0 0-.25.25V8h5V6Zm-5 8v3.75c0 .14.11.25.25.25H9.5v-4h-5Zm6.5 4h8.25c.14 0 .25-.11.25-.25V14H11v4Z"/></svg>',
  };
  return icons[icon];
}

export function getBlockStyleMenuCheckSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.55 16.6a.75.75 0 0 1-1.06 0l-3.1-3.1a.75.75 0 1 1 1.06-1.06l2.57 2.57l8.53-8.53a.75.75 0 1 1 1.06 1.06L9.55 16.6Z"/></svg>';
}

export function getBlockStyleMenuPosition({
  left,
  top,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
}: BlockStyleMenuPositionInput) {
  return {
    left: Math.min(viewportWidth - menuWidth - gap, Math.max(gap, left)),
    top: Math.min(viewportHeight - menuHeight - gap, Math.max(gap, top)),
  };
}

function isBlockStyleMenuItemKey(value: string | null | undefined): value is BlockStyleMenuItemKey {
  return Boolean(value && getBlockStyleMenuItemKeys().includes(value as BlockStyleMenuItemKey));
}

function isListBlockStyle(key: BlockStyleMenuItemKey | null) {
  return key === "bullet-list" || key === "ordered-list" || key === "task-list";
}

export function resolveBlockStyleMenuAction(
  currentKey: BlockStyleMenuItemKey | null,
  requestedKey: BlockStyleMenuItemKey,
): BlockStyleMenuAction {
  const key = currentKey === requestedKey && requestedKey !== "text" ? "text" : requestedKey;
  return {
    key,
    normalizeToTextFirst: Boolean(
      currentKey &&
        (currentKey === "h1" || currentKey === "h2") &&
        isListBlockStyle(key),
    ),
  };
}

export function blockStylePointerDidClick(start: PointerPoint, end: PointerPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y) <= blockStyleClickDistance;
}

export function resolveBlockStyleKey(path: BlockStyleNodePath): BlockStyleMenuItemKey | null {
  const names = path.map((node) => node.typeName);
  const current = path[path.length - 1];
  const listItem = path.find((node) => node.typeName === "list_item");

  if (names.includes("table")) return "table";
  if (names.includes("code_block")) return "code";
  if (listItem?.attrs && "checked" in listItem.attrs && listItem.attrs.checked !== null) return "task-list";
  if (names.includes("bullet_list")) return "bullet-list";
  if (names.includes("ordered_list")) return "ordered-list";
  if (names.includes("blockquote")) return "quote";
  if (current?.typeName === "heading") return current.attrs?.level === 2 ? "h2" : "h1";
  if (current?.typeName === "paragraph") return "text";
  return null;
}

export function markEmptyAddHandlePointer(target: EventTarget | null) {
  if (!isEmptyAddHandleTarget(target)) return false;

  emptyAddHandlePointerPending = true;
  if (emptyAddHandlePointerTimer) globalThis.clearTimeout(emptyAddHandlePointerTimer);
  emptyAddHandlePointerTimer = globalThis.setTimeout(() => {
    emptyAddHandlePointerPending = false;
    emptyAddHandlePointerTimer = null;
  }, 800);
  return true;
}

function clearEmptyAddHandlePointerPending() {
  emptyAddHandlePointerPending = false;
  if (emptyAddHandlePointerTimer) {
    globalThis.clearTimeout(emptyAddHandlePointerTimer);
    emptyAddHandlePointerTimer = null;
  }
}

function getCrepeInsertMenuAPI(ctx: Ctx) {
  try {
    return ctx.get<CrepeInsertMenuAPI, "menuAPICtx">("menuAPICtx");
  } catch {
    return null;
  }
}

function getClosestElement(target: EventTarget | null, selector: string) {
  if (target instanceof Element) return target.closest(selector);
  if (!hasClosest(target)) return null;
  const closest = target.closest(selector);
  return closest instanceof Element ? closest : null;
}

function getHandleStyleKey(root: Element, target?: EventTarget | null) {
  const handle =
    getClosestElement(target ?? null, blockHandleSelector) ??
    root.querySelector(blockHandleSelector);
  const style = handle?.getAttribute("data-mewmo-style");
  return isBlockStyleMenuItemKey(style) ? style : null;
}

function getPathTableDepth(path: BlockStyleNodePath) {
  const index = path.findIndex((node) => node.typeName === "table");
  return index < 0 ? null : index + 1;
}

function getBlockStyleMenuTargetFromResolvedPos(
  $pos: Selection["$from"],
  preferredKey: BlockStyleMenuItemKey | null,
): BlockStyleMenuTarget | null {
  const path: BlockStyleNodePath = [];
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    path.push({ typeName: node.type.name, attrs: node.attrs });
  }

  const currentKey = resolveBlockStyleKey(path);
  if (preferredKey && currentKey && preferredKey !== currentKey) return null;

  const stableCurrentKey = preferredKey ?? currentKey;
  if (!stableCurrentKey) return null;

  const tableDepth = getPathTableDepth(path);
  if (stableCurrentKey === "table" && tableDepth) {
    return { position: $pos.before(tableDepth), currentKey: stableCurrentKey, selectionType: "node" };
  }

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (shouldOpenBlockStyleMenuForNode(node.type.name, node.isTextblock)) {
      return { position: $pos.end(depth), currentKey: stableCurrentKey, selectionType: "text" };
    }
  }

  return null;
}

function getBlockStyleMenuTargetFromElement(
  view: EditorView,
  element: Element,
  preferredKey: BlockStyleMenuItemKey | null,
) {
  const candidates = new Set<number>();
  const childCount = element.childNodes.length;

  try {
    candidates.add(view.posAtDOM(element, 0));
  } catch {
    // DOM-backed fallback is best-effort; posAtCoords remains the primary path.
  }

  try {
    candidates.add(view.posAtDOM(element, childCount));
  } catch {
    // Some node-view internals do not map cleanly to document positions.
  }

  for (const pos of candidates) {
    for (const candidate of [pos, pos + 1]) {
      if (candidate < 0 || candidate > view.state.doc.content.size) continue;
      const target = getBlockStyleMenuTargetFromResolvedPos(
        view.state.doc.resolve(candidate),
        preferredKey,
      );
      if (target) return target;
    }
  }

  return null;
}

function getBlockStyleMenuTargetFromDom(
  view: EditorView,
  clientY: number,
  preferredKey: BlockStyleMenuItemKey | null,
) {
  const rect = view.dom.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const elements =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, clientY)
      : [document.elementFromPoint(x, clientY)].filter(Boolean);

  for (const element of elements) {
    const block = element?.closest?.(blockStyleTargetSelector);
    if (!block || !view.dom.contains(block)) continue;
    const target = getBlockStyleMenuTargetFromElement(view, block, preferredKey);
    if (target) return target;
  }

  const blocks = Array.from(view.dom.querySelectorAll(blockStyleTargetSelector));
  blocks.sort((a, b) => {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const aDistance = Math.abs(aRect.top + aRect.height / 2 - clientY);
    const bDistance = Math.abs(bRect.top + bRect.height / 2 - clientY);
    return aDistance - bDistance;
  });

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (clientY < rect.top - 32 || clientY > rect.bottom + 32) continue;
    const target = getBlockStyleMenuTargetFromElement(view, block, preferredKey);
    if (target) return target;
  }

  return null;
}

function getBlockStyleMenuTarget(
  view: EditorView,
  clientY: number,
  handleTarget?: EventTarget | null,
) {
  const root = view.dom.closest(editorWrapperSelector) ?? view.dom;
  const handleKey = getHandleStyleKey(root, handleTarget);
  const rect = view.dom.getBoundingClientRect();
  const left = rect.left + rect.width / 2;
  const coords = view.posAtCoords({ left, top: clientY });

  if (coords) {
    const target = getBlockStyleMenuTargetFromResolvedPos(view.state.doc.resolve(coords.pos), handleKey);
    if (target) return target;
  }

  const domTarget = getBlockStyleMenuTargetFromDom(view, clientY, handleKey);
  if (domTarget) return domTarget;

  return getBlockStyleMenuTargetFromResolvedPos(view.state.selection.$from, handleKey);
}

function applySelectionForBlockStyleTarget(view: EditorView, target: BlockStyleMenuTarget) {
  const selection =
    target.selectionType === "node"
      ? NodeSelection.create(view.state.doc, target.position)
      : TextSelection.create(view.state.doc, target.position);
  view.dispatch(view.state.tr.setSelection(selection));
}

function replaceSelectionWithParagraph(ctx: Ctx, view: EditorView) {
  const paragraph = paragraphSchema.type(ctx).createAndFill();
  if (!paragraph) return;

  const from = view.state.selection.from;
  const tr = view.state.tr.replaceSelectionWith(paragraph);
  const selectionPos = Math.min(from + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.create(tr.doc, selectionPos));
  view.dispatch(tr);
}

function insertTableAtCurrentBlock(ctx: Ctx) {
  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);
  const { from } = view.state.selection;

  commands.call(clearTextInCurrentBlockCommand.key);
  commands.call(addBlockTypeCommand.key, {
    nodeType: createTable(ctx, 3, 3),
  });
  commands.call(selectTextNearPosCommand.key, { pos: from });
}

function runBlockStyleMenuCommand(ctx: Ctx, key: BlockStyleMenuItemKey) {
  const commands = ctx.get(commandsCtx);

  if (key === "text") {
    commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
    return;
  }

  if (key === "h1" || key === "h2") {
    commands.call(setBlockTypeCommand.key, {
      nodeType: headingSchema.type(ctx),
      attrs: { level: key === "h1" ? 1 : 2 },
    });
    return;
  }

  if (key === "quote") {
    commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteSchema.type(ctx) });
    return;
  }

  if (key === "bullet-list") {
    commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletListSchema.type(ctx) });
    return;
  }

  if (key === "ordered-list") {
    commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedListSchema.type(ctx) });
    return;
  }

  if (key === "task-list") {
    commands.call(wrapInBlockTypeCommand.key, {
      nodeType: listItemSchema.type(ctx),
      attrs: { checked: false },
    });
    return;
  }

  if (key === "table") {
    insertTableAtCurrentBlock(ctx);
    return;
  }

  commands.call(setBlockTypeCommand.key, { nodeType: codeBlockSchema.type(ctx) });
}

function selectionTypePath(selection: TextSelection) {
  const path: string[] = [];
  for (let depth = 1; depth <= selection.$from.depth; depth += 1) {
    path.push(selection.$from.node(depth).type.name);
  }
  return path;
}

function currentSelectionBlockStyleKey(selection: Selection): BlockStyleMenuItemKey | null {
  if (selection instanceof NodeSelection) {
    return resolveBlockStyleKey([{ typeName: selection.node.type.name, attrs: selection.node.attrs }]);
  }

  if (!(selection instanceof TextSelection)) return null;

  const path: BlockStyleNodePath = [];
  for (let depth = 1; depth <= selection.$from.depth; depth += 1) {
    const node = selection.$from.node(depth);
    path.push({ typeName: node.type.name, attrs: node.attrs });
  }
  return resolveBlockStyleKey(path);
}

function liftCurrentWrapper(ctx: Ctx, view: EditorView, currentKey: BlockStyleMenuItemKey | null) {
  if (isListBlockStyle(currentKey)) {
    const listItem = listItemSchema.type(ctx);
    liftListItem(listItem)(view.state, view.dispatch);
    return;
  }

  if (currentKey === "quote") {
    lift(view.state, view.dispatch);
  }
}

function switchBlockStyle(ctx: Ctx, view: EditorView, key: BlockStyleMenuItemKey) {
  const selection = view.state.selection;
  const currentKey = currentSelectionBlockStyleKey(selection);
  if (currentKey === key && key === "text") return;
  const action = resolveBlockStyleMenuAction(currentKey, key);

  if (currentKey === "table" && action.key !== "table") {
    replaceSelectionWithParagraph(ctx, view);
    if (action.key !== "text") runBlockStyleMenuCommand(ctx, action.key);
    return;
  }

  liftCurrentWrapper(ctx, view, currentKey);
  if (action.normalizeToTextFirst) {
    ctx.get(commandsCtx).call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
  }
  runBlockStyleMenuCommand(ctx, action.key);
}

function createBlockStyleMenu(ctx: Ctx, view: EditorView) {
  const menu = document.createElement("div");
  menu.className = "milkdown-slash-menu mewmo-block-style-menu";
  menu.dataset.show = "false";
  menu.innerHTML = [
    '<div class="menu-groups">',
    '<div class="menu-group">',
    "<ul>",
    ...blockStyleMenuItems.map((item) => (
      `<li data-mewmo-block-style="${item.key}" data-mewmo-active="false"><span class="mewmo-block-style-menu__icon">${getBlockStyleMenuIconSvg(item.icon)}</span><span>${item.label}</span><span class="mewmo-block-style-menu__check">${getBlockStyleMenuCheckSvg()}</span></li>`
    )),
    "</ul>",
    "</div>",
    "</div>",
  ].join("");

  const hide = () => {
    menu.dataset.show = "false";
  };

  const show = (left: number, top: number, currentKey: BlockStyleMenuItemKey | null) => {
    menu.querySelectorAll<HTMLElement>("[data-mewmo-block-style]").forEach((item) => {
      const isActive = item.dataset.mewmoBlockStyle === currentKey;
      item.dataset.mewmoActive = isActive ? "true" : "false";
      item.setAttribute("aria-current", isActive ? "true" : "false");
    });
    const position = getBlockStyleMenuPosition({
      left,
      top,
      menuWidth: menu.offsetWidth || 218,
      menuHeight: menu.offsetHeight || 260,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    Object.assign(menu.style, {
      position: "fixed",
      left: `${position.left}px`,
      top: `${position.top}px`,
    });
    menu.dataset.show = "true";
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (menu.dataset.show !== "true") return;
    if (event.target instanceof Node && menu.contains(event.target)) {
      event.preventDefault();
      return;
    }
    hide();
  };

  const handlePointerUp = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const item = target.closest("[data-mewmo-block-style]");
    if (!(item instanceof HTMLElement)) return;

    const key = item.dataset.mewmoBlockStyle as BlockStyleMenuItemKey | undefined;
    if (!key || !getBlockStyleMenuItemKeys().includes(key)) return;

    event.preventDefault();
    switchBlockStyle(ctx, view, key);
    hide();
    view.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  };

  menu.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
  document.addEventListener("keydown", handleKeyDown, { capture: true });

  return {
    element: menu,
    show,
    hide,
    destroy() {
      menu.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      menu.remove();
    },
  };
}

export const editorInteractions = $prose(
  (ctx) =>
    new Plugin({
      view(view) {
        const root = view.dom.closest(editorWrapperSelector) ?? view.dom.parentElement;
        if (!root) return {};
        const blockStyleMenu = createBlockStyleMenu(ctx, view);
        let emptyAddPointerStart: BlockStylePointerStart | null = null;
        let blockStylePointerStart: BlockStylePointerStart | null = null;
        root.appendChild(blockStyleMenu.element);

        const handlePointerDown = (event: Event) => {
          if (markEmptyAddHandlePointer(event.target)) {
            const pointerEvent = event as PointerEvent;
            emptyAddPointerStart = {
              x: pointerEvent.clientX,
              y: pointerEvent.clientY,
              target: event.target,
            };
            blockStyleMenu.hide();
            return;
          }

          if (!isBlockStyleHandleTarget(event.target)) return;

          const pointerEvent = event as PointerEvent;
          blockStylePointerStart = {
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
            target: event.target,
          };
          blockStyleMenu.hide();
        };

        const handlePointerUp = (event: Event) => {
          if (emptyAddPointerStart) {
            const pointerEvent = event as PointerEvent;
            const start = emptyAddPointerStart;
            emptyAddPointerStart = null;
            if (
              shouldOpenInsertMenuAtCurrentEmptyBlock(
                start.target,
                event.target,
                blockStylePointerDidClick(start, { x: pointerEvent.clientX, y: pointerEvent.clientY }),
              )
            ) {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              pointerEvent.stopImmediatePropagation();
              clearEmptyAddHandlePointerPending();

              const menuTarget = getBlockStyleMenuTarget(view, pointerEvent.clientY);
              const menuPosition = menuTarget?.position ?? view.state.selection.from;
              view.focus();
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, menuPosition)));
              getCrepeInsertMenuAPI(ctx)?.show(menuPosition);
              return;
            }
          }

          if (!blockStylePointerStart) return;
          const pointerEvent = event as PointerEvent;
          const start = blockStylePointerStart;
          blockStylePointerStart = null;
          if (!shouldOpenBlockStyleMenuFromHandle(start.target, event.target)) return;
          if (!blockStylePointerDidClick(start, { x: pointerEvent.clientX, y: pointerEvent.clientY })) return;

          const menuTarget = getBlockStyleMenuTarget(view, pointerEvent.clientY, start.target);
          if (menuTarget == null) return;
          pointerEvent.preventDefault();
          pointerEvent.stopPropagation();
          pointerEvent.stopImmediatePropagation();

          view.focus();
          applySelectionForBlockStyleTarget(view, menuTarget);
          blockStyleMenu.show(pointerEvent.clientX + 8, pointerEvent.clientY + 8, menuTarget.currentKey);
        };

        root.addEventListener("pointerdown", handlePointerDown, { capture: true });
        root.addEventListener("pointerup", handlePointerUp, { capture: true });

        return {
          destroy() {
            root.removeEventListener("pointerdown", handlePointerDown, { capture: true });
            root.removeEventListener("pointerup", handlePointerUp, { capture: true });
            blockStyleMenu.destroy();
          },
        };
      },
      appendTransaction(transactions, _oldState, newState) {
        if (!emptyAddHandlePointerPending || !transactions.some((tr) => tr.docChanged)) return null;

        clearEmptyAddHandlePointerPending();

        const { selection } = newState;
        if (!(selection instanceof TextSelection) || selection.$from.depth < 1) return null;

        const currentBlockStart = selection.$from.before(1);
        const currentNode = selection.$from.node(1);
        const previousNode = newState.doc.resolve(currentBlockStart).nodeBefore;

        if (
          newState.doc.childCount <= 1 ||
          currentNode.type.name !== "paragraph" ||
          currentNode.textContent.trim() ||
          previousNode?.type.name !== "paragraph" ||
          previousNode.textContent.trim()
        ) {
          return null;
        }

        return newState.tr.delete(currentBlockStart - previousNode.nodeSize, currentBlockStart);
      },
      props: {
        handleDOMEvents: {
          keydown(view, event) {
            const selection = view.state.selection;
            if (
              event.key === "Backspace" &&
              selection instanceof TextSelection &&
              selection.$from.depth >= 1
            ) {
              const blockStart = selection.$from.before(1);
              const previousNode = view.state.doc.resolve(blockStart).nodeBefore;
              if (
                shouldJoinFormattedBlockWithPrevious(
                  selectionTypePath(selection),
                  selection.$from.parentOffset,
                  selection.$from.parent.content.size,
                  selection.empty,
                  Boolean(previousNode),
                ) &&
                joinTextblockBackward(view.state, view.dispatch, view)
              ) {
                event.preventDefault();
                return true;
              }
            }

            if (
              event.key === "Backspace" &&
              selection instanceof TextSelection &&
              shouldLiftBlockquoteFormat(selectionTypePath(selection), selection.$from.parentOffset, selection.empty) &&
              lift(view.state, view.dispatch)
            ) {
              event.preventDefault();
              return true;
            }

            if (
              event.key !== "Backspace" ||
              !(selection instanceof TextSelection) ||
              selection.$from.depth < 1 ||
              !shouldClearEmptyHeadingFormat(
                selection.$from.parent.type.name,
                selection.$from.parent.content.size,
                selection.empty,
              )
            ) {
              return false;
            }

            const paragraph = view.state.schema.nodes.paragraph;
            if (!paragraph) return false;

            const blockStart = selection.$from.before(1);
            view.dispatch(view.state.tr.setNodeMarkup(blockStart, paragraph));
            event.preventDefault();
            return true;
          },
          dragstart(view, event) {
            const selection = view.state.selection;
            if (!shouldBlockSelectionDrag(selection, selection instanceof TextSelection)) return false;

            event.preventDefault();
            return true;
          },
        },
      },
    }),
);
