import type {
  Node as ProseMirrorNode,
  Slice,
} from "@milkdown/kit/prose/model";

const HTML_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;
const EMPTY_VISIBLE_TEXT = "\u200B";

function visibleLeafText(node: ProseMirrorNode) {
  if (node.type.name === "html") {
    const value = typeof node.attrs.value === "string" ? node.attrs.value : "";
    return HTML_BREAK_RE.test(value) ? "\n" : "";
  }
  return node.type.spec.leafText?.(node) ?? "";
}

export function serializeNoteSelectionText(slice: Slice) {
  const text = slice.content.textBetween(
    0,
    slice.content.size,
    "\n\n",
    visibleLeafText,
  );

  // A falsy direct result makes ProseMirror try Milkdown's Markdown serializer.
  return text || (slice.content.size > 0 ? EMPTY_VISIBLE_TEXT : "");
}
