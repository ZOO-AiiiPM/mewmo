import type {
  Node as ProseMirrorNode,
  Slice,
} from "@milkdown/kit/prose/model";

const HTML_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;

function visibleLeafText(node: ProseMirrorNode) {
  if (node.type.name === "html") {
    const value = typeof node.attrs.value === "string" ? node.attrs.value : "";
    return HTML_BREAK_RE.test(value) ? "\n" : "";
  }
  return node.type.spec.leafText?.(node) ?? "";
}

export function serializeNoteSelectionText(slice: Slice) {
  return slice.content.textBetween(
    0,
    slice.content.size,
    "\n\n",
    visibleLeafText,
  );
}
