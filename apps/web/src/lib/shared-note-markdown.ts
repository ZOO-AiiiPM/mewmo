export type SharedNoteMarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: SharedNoteMarkdownInline[] }
  | { type: "emphasis"; children: SharedNoteMarkdownInline[] }
  | { type: "strikethrough"; children: SharedNoteMarkdownInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: SharedNoteMarkdownInline[] }
  | { type: "image"; src: string; alt: string };

export interface SharedNoteMarkdownListItem {
  children: SharedNoteMarkdownInline[];
  /** Nesting level derived from leading indentation (2 spaces per level). */
  depth: number;
  /** Present only for task-list items (`- [ ]` / `- [x]`). */
  task?: "unchecked" | "checked";
}

export type SharedNoteMarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: SharedNoteMarkdownInline[] }
  | { type: "paragraph"; children: SharedNoteMarkdownInline[] }
  | { type: "blockquote"; children: SharedNoteMarkdownInline[] }
  | { type: "list"; ordered: boolean; items: SharedNoteMarkdownListItem[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "image"; src: string; alt: string }
  | { type: "table"; headers: SharedNoteMarkdownInline[][]; rows: SharedNoteMarkdownInline[][][] }
  | { type: "divider" };

export function parseSharedNoteMarkdown(markdown: string): SharedNoteMarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: SharedNoteMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "code",
        language: fence[1] ?? null,
        code: trimTrailingBlankLines(codeLines).join("\n"),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading?.[1] && heading[2]) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseSharedNoteInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }

    // Thematic break — must run before list/table detection so `---` never
    // becomes a stray list/paragraph.
    if (isDividerLine(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const blockImage = line.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
    if (blockImage?.[2] && isSafeImageSrc(blockImage[2])) {
      blocks.push({
        type: "image",
        src: blockImage[2],
        alt: blockImage[1] ?? "",
      });
      index += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(/^>\s?(.*)$/);
        if (!match) break;
        quoteLines.push(match[1] ?? "");
        index += 1;
      }
      blocks.push({
        type: "blockquote",
        children: parseSharedNoteInlineMarkdown(quoteLines.join(" ").trim()),
      });
      continue;
    }

    const list = parseList(lines, index);
    if (list) {
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && shouldContinueParagraph(lines, index)) {
      paragraphLines.push((lines[index] ?? "").trim());
      index += 1;
    }
    const paragraph = paragraphLines.join(" ").trim();
    if (paragraph) {
      blocks.push({
        type: "paragraph",
        children: parseSharedNoteInlineMarkdown(paragraph),
      });
    }
  }

  return blocks;
}

export function parseSharedNoteInlineMarkdown(value: string): SharedNoteMarkdownInline[] {
  const result: SharedNoteMarkdownInline[] = [];
  let remaining = value;

  while (remaining) {
    const token = findNextInlineToken(remaining);
    if (!token) {
      result.push({ type: "text", value: remaining });
      break;
    }

    if (token.index > 0) {
      result.push({ type: "text", value: remaining.slice(0, token.index) });
    }

    if (token.type === "code") {
      result.push({ type: "code", value: token.value });
    } else if (token.type === "image") {
      result.push({ type: "image", src: token.src, alt: token.alt });
    } else if (token.type === "link") {
      result.push({
        type: "link",
        href: token.href,
        children: parseSharedNoteInlineMarkdown(token.label),
      });
    } else if (token.type === "strong") {
      result.push({
        type: "strong",
        children: parseSharedNoteInlineMarkdown(token.value),
      });
    } else if (token.type === "strikethrough") {
      result.push({
        type: "strikethrough",
        children: parseSharedNoteInlineMarkdown(token.value),
      });
    } else {
      result.push({
        type: "emphasis",
        children: parseSharedNoteInlineMarkdown(token.value),
      });
    }

    remaining = remaining.slice(token.index + token.raw.length);
  }

  return mergeAdjacentText(result);
}

export interface SharedNoteMarkdownListNode {
  item: SharedNoteMarkdownListItem;
  children: SharedNoteMarkdownListNode[];
}

/**
 * Fold the flat, depth-annotated list items into a tree so renderers can emit
 * properly nested ul/ol markup.
 */
export function buildSharedNoteListTree(items: SharedNoteMarkdownListItem[]): SharedNoteMarkdownListNode[] {
  const roots: SharedNoteMarkdownListNode[] = [];
  const stack: Array<{ depth: number; node: SharedNoteMarkdownListNode }> = [];

  for (const item of items) {
    const node: SharedNoteMarkdownListNode = { item, children: [] };
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= item.depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ depth: item.depth, node });
  }

  return roots;
}

function isDividerLine(line: string) {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function shouldContinueParagraph(lines: string[], index: number) {
  const line = lines[index] ?? "";
  if (!line.trim()) return false;
  if (/^\s*```/.test(line)) return false;
  if (/^#{1,6}\s+/.test(line)) return false;
  if (/^>\s?/.test(line)) return false;
  if (isDividerLine(line)) return false;
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) return false;
  const blockImage = line.match(
    /^!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/,
  );
  if (blockImage?.[1] && isSafeImageSrc(blockImage[1])) return false;
  if (parseTable(lines, index)) return false;
  return true;
}

const UNORDERED_ITEM_PATTERN = /^(\s*)[-*+]\s+(.+)$/;
const ORDERED_ITEM_PATTERN = /^(\s*)\d+[.)]\s+(.+)$/;
const TASK_PATTERN = /^\[( |x|X)\]\s+(.*)$/;

function parseList(lines: string[], startIndex: number) {
  const first = lines[startIndex] ?? "";
  if (isDividerLine(first)) return null;
  const ordered = ORDERED_ITEM_PATTERN.test(first);
  if (!ordered && !UNORDERED_ITEM_PATTERN.test(first)) return null;

  const baseIndent = indentWidth(first.match(/^(\s*)/)?.[1] ?? "");
  const items: SharedNoteMarkdownListItem[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isDividerLine(line)) break;
    const match = line.match(UNORDERED_ITEM_PATTERN) ?? line.match(ORDERED_ITEM_PATTERN);
    if (!match) break;
    const lineOrdered = ORDERED_ITEM_PATTERN.test(line) && !UNORDERED_ITEM_PATTERN.test(line);
    const depth = Math.max(0, Math.floor((indentWidth(match[1] ?? "") - baseIndent) / 2));
    // A top-level marker of the other list kind starts a fresh block.
    if (depth === 0 && lineOrdered !== ordered && index > startIndex) break;

    let content = (match[2] ?? "").trim();
    let task: SharedNoteMarkdownListItem["task"];
    const taskMatch = content.match(TASK_PATTERN);
    if (taskMatch) {
      task = taskMatch[1] === " " ? "unchecked" : "checked";
      content = (taskMatch[2] ?? "").trim();
    }

    items.push({
      children: parseSharedNoteInlineMarkdown(content),
      depth,
      ...(task ? { task } : {}),
    });
    index += 1;
  }

  if (items.length === 0) return null;

  return {
    block: { type: "list", ordered, items } satisfies SharedNoteMarkdownBlock,
    nextIndex: index,
  };
}

function indentWidth(indent: string) {
  return indent.replace(/\t/g, "  ").length;
}

function parseTable(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex] ?? "";
  const separatorLine = lines[startIndex + 1] ?? "";
  if (!headerLine.includes("|") || !isTableSeparator(separatorLine)) return null;

  const headers = splitTableCells(headerLine).map(parseSharedNoteInlineMarkdown);
  const rows: SharedNoteMarkdownInline[][][] = [];
  let index = startIndex + 2;

  while (index < lines.length && (lines[index] ?? "").includes("|")) {
    rows.push(splitTableCells(lines[index] ?? "").map(parseSharedNoteInlineMarkdown));
    index += 1;
  }

  return {
    block: { type: "table", headers, rows } satisfies SharedNoteMarkdownBlock,
    nextIndex: index,
  };
}

function isTableSeparator(line: string) {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

type InlineToken =
  | { type: "code"; index: number; raw: string; value: string }
  | { type: "image"; index: number; raw: string; src: string; alt: string }
  | { type: "link"; index: number; raw: string; href: string; label: string }
  | { type: "strong" | "emphasis" | "strikethrough"; index: number; raw: string; value: string };

function findNextInlineToken(value: string): InlineToken | null {
  const tokens = [
    findCodeToken(value),
    findImageToken(value),
    findLinkToken(value),
    findStrongToken(value),
    findStrikethroughToken(value),
    findEmphasisToken(value),
  ].filter((token): token is InlineToken => Boolean(token));

  tokens.sort((a, b) => a.index - b.index);
  return tokens[0] ?? null;
}

function findCodeToken(value: string): InlineToken | null {
  const match = /`([^`]+)`/.exec(value);
  if (!match || match.index < 0) return null;
  return { type: "code", index: match.index, raw: match[0], value: match[1] ?? "" };
}

function findImageToken(value: string): InlineToken | null {
  const match = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(value);
  if (!match || match.index < 0 || !match[2] || !isSafeImageSrc(match[2])) return null;
  return {
    type: "image",
    index: match.index,
    raw: match[0],
    alt: match[1] ?? "",
    src: match[2],
  };
}

function findLinkToken(value: string): InlineToken | null {
  const match = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(value);
  if (!match || match.index < 0 || !match[2] || !isSafeHref(match[2])) return null;
  return {
    type: "link",
    index: match.index,
    raw: match[0],
    label: match[1] ?? "",
    href: match[2],
  };
}

function findStrongToken(value: string): InlineToken | null {
  const match = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/.exec(value);
  if (!match || match.index < 0) return null;
  return {
    type: "strong",
    index: match.index,
    raw: match[0],
    value: match[1] ?? match[2] ?? "",
  };
}

function findStrikethroughToken(value: string): InlineToken | null {
  const match = /~~([^~\n]+)~~/.exec(value);
  if (!match || match.index < 0) return null;
  return {
    type: "strikethrough",
    index: match.index,
    raw: match[0],
    value: match[1] ?? "",
  };
}

function findEmphasisToken(value: string): InlineToken | null {
  const match = /\*([^*\n]+)\*|_([^_\n]+)_/.exec(value);
  if (!match || match.index < 0) return null;
  return {
    type: "emphasis",
    index: match.index,
    raw: match[0],
    value: match[1] ?? match[2] ?? "",
  };
}

function mergeAdjacentText(inlines: SharedNoteMarkdownInline[]) {
  return inlines.reduce<SharedNoteMarkdownInline[]>((items, item) => {
    const previous = items[items.length - 1];
    if (previous?.type === "text" && item.type === "text") {
      previous.value += item.value;
      return items;
    }
    items.push(item);
    return items;
  }, []);
}

function trimTrailingBlankLines(lines: string[]) {
  const copy = [...lines];
  while (copy.length > 0 && !copy[copy.length - 1]?.trim()) {
    copy.pop();
  }
  return copy;
}

function isSafeHref(value: string) {
  return /^(https?:|mailto:|\/|#)/i.test(value) && !/^\/\//.test(value);
}

function isSafeImageSrc(value: string) {
  return /^(https?:|\/|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i.test(value) && !/^\/\//.test(value);
}
