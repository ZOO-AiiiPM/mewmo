const blockTagPattern =
  /<\/?(?:address|article|aside|blockquote|div|dl|dt|dd|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

export function normalizeListCardPreview(
  source: string,
  maxLength: number | null = 240,
) {
  const normalized = source
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(blockTagPattern, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]+/g, " ").trim())
    .filter((line) => line && !isMarkdownThematicBreak(line))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/ +([，。！？；：、])/g, "$1")
    .replace(/([，。！？；：、]) +/g, "$1")
    .trim();

  if (maxLength === null) return normalized;
  return Array.from(normalized).slice(0, maxLength).join("");
}

function isMarkdownThematicBreak(line: string) {
  return /^(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}
