const HTML_BREAK_RE = /<br\s*\/?>/gi;
const HTML_TAG_RE = /<[^>]+>/g;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export function formatKnowledgeImportPreviewParagraphs(content?: string | null, fallback?: string | null) {
  const source = content?.trim() ? content : fallback;
  if (!source?.trim()) return [];

  return source
    .replace(HTML_BREAK_RE, "\n")
    .replace(HTML_TAG_RE, "")
    .split(/\n+/)
    .map(cleanPreviewLine)
    .filter(Boolean);
}

function cleanPreviewLine(value: string) {
  const line = decodePreviewEntities(value).trim();
  if (!line || TABLE_DIVIDER_RE.test(line)) return "";

  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\|+|\|+$/g, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function decodePreviewEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
