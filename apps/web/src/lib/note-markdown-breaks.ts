const INLINE_BREAK_RE = /<br\s*\/?>/gi;
const STANDALONE_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;
const FENCE_RE = /^\s*(```|~~~)/;

export function normalizeNoteMarkdownBreaks(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let fenceMarker: "```" | "~~~" | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(FENCE_RE)?.[1] as "```" | "~~~" | undefined;
    if (fence) {
      if (!fenceMarker) fenceMarker = fence;
      else if (fenceMarker === fence) fenceMarker = null;
      normalized.push(line);
      continue;
    }

    if (fenceMarker) {
      normalized.push(line);
      continue;
    }

    if (STANDALONE_BREAK_RE.test(line)) {
      while (normalized.at(-1)?.trim() === "") normalized.pop();
      let nextIndex = index + 1;
      while (nextIndex < lines.length && !(lines[nextIndex] ?? "").trim()) {
        nextIndex += 1;
      }
      if (normalized.length > 0 && nextIndex < lines.length) normalized.push("");
      index = nextIndex - 1;
      continue;
    }

    normalized.push(line.replace(INLINE_BREAK_RE, "  \n"));
  }

  return normalized.join("\n");
}
