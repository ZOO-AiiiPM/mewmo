import { extractClipBodyHtml, sanitizeClipHtml, stripHtml } from "./clip-content";

interface NormalizeFeedEntryContentInput {
  title: string;
  url: string;
  content: string;
}

export interface NormalizedFeedEntryContent {
  content: string;
  excerpt: string;
  coverImage?: string | undefined;
}

export function normalizeFeedEntryContent({
  title,
  url,
  content,
}: NormalizeFeedEntryContentInput): NormalizedFeedEntryContent {
  const body = stripDuplicateTitle(extractClipBodyHtml(content), title);
  const safe = sanitizeClipHtml(body, url);
  const excerpt = stripHtml(body).slice(0, 260);
  return {
    content: body,
    excerpt,
    ...(firstImageUrl(safe) ? { coverImage: firstImageUrl(safe) } : {}),
  };
}

function stripDuplicateTitle(html: string, title: string) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return html;

  let seen = 0;
  return html.replace(/<h([1-3])\b[^>]*>[\s\S]*?<\/h\1>/gi, (match) => {
    seen += 1;
    if (seen > 3) return match;
    return normalizeText(stripHtml(match)) === normalizedTitle ? "" : match;
  });
}

function firstImageUrl(html: string) {
  const match = html.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
  return match?.[1] ? unescapeAttribute(match[1]) : undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unescapeAttribute(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&lt;/g, "<");
}
