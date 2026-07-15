const INLINE_BREAK_RE = /<br\s*\/?>/gi;
const STANDALONE_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;
const OPENING_FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSING_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

interface FenceMarker {
  character: "`" | "~";
  length: number;
}

export function normalizeNoteMarkdownBreaks(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let fenceMarker: FenceMarker | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fenceMarker) {
      const closingFence = line.match(CLOSING_FENCE_RE)?.[1];
      if (
        closingFence?.charAt(0) === fenceMarker.character &&
        closingFence.length >= fenceMarker.length
      ) {
        fenceMarker = null;
      }
      normalized.push(line);
      continue;
    }

    const openingFence = line.match(OPENING_FENCE_RE);
    const openingMarker = openingFence?.[1];
    const openingInfo = openingFence?.[2] ?? "";
    if (
      openingMarker &&
      (openingMarker.charAt(0) === "~" || !openingInfo.includes("`"))
    ) {
      fenceMarker = {
        character: openingMarker.charAt(0) as "`" | "~",
        length: openingMarker.length,
      };
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
