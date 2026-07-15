const BODY_SELECTORS = [
  { kind: "id", value: "js_content" },
  { kind: "class", value: "RichText" },
  { kind: "class", value: "article-body" },
  { kind: "class", value: "article__main__content" },
  { kind: "class", value: "article__content" },
  { kind: "class", value: "article--content" },
  { kind: "class", value: "article-content" },
  { kind: "class", value: "post__content" },
  { kind: "class", value: "post-content" },
  { kind: "class", value: "entry-content" },
  { kind: "tag", value: "article" },
  { kind: "attr", name: "role", value: "main" },
  { kind: "tag", value: "main" },
] as const;

type ArticleBodySelector =
  | { kind: "id"; value: string }
  | { kind: "class"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "attr"; name: string; value: string };

export function extractArticleBodyHtml(html: string): string {
  const source = html.trim();
  if (!source) return "";
  if (!/^<(?:!doctype|html)\b/i.test(source)) return html;

  for (const selector of BODY_SELECTORS) {
    const body = extractElementInnerHtml(source, selector);
    const textLength = body ? stripHtml(body).length : 0;
    if (body && (selector.kind === "id" || selector.kind === "class" || textLength > 20)) {
      return body.trim();
    }
  }

  return extractElementInnerHtml(source, { kind: "tag", value: "body" })?.trim() ?? html;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractElementInnerHtml(html: string, selector: ArticleBodySelector): string | null {
  const matcher = buildOpenTagMatcher(selector);
  const match = matcher.exec(html);
  if (!match || match.index === undefined) return null;

  const tag = match[1]?.toLowerCase();
  if (!tag) return null;
  const openEnd = match.index + match[0].length;
  const closeStart = findClosingTag(html, tag, openEnd);
  if (closeStart === -1) return null;
  return html.slice(openEnd, closeStart);
}

function buildOpenTagMatcher(selector: ArticleBodySelector): RegExp {
  if (selector.kind === "tag") {
    return new RegExp(`<(${escapeRegExp(selector.value)})\\b[^>]*>`, "i");
  }
  if (selector.kind === "id") {
    return new RegExp(
      `<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bid=["']${escapeRegExp(selector.value)}["'])[^>]*>`,
      "i",
    );
  }
  if (selector.kind === "attr") {
    return new RegExp(
      `<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\b${escapeRegExp(selector.name)}=["']${escapeRegExp(selector.value)}["'])[^>]*>`,
      "i",
    );
  }
  return new RegExp(
    `<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bclass=["'](?:[^"']*\\s)?${escapeRegExp(selector.value)}(?:\\s[^"']*)?["'])[^>]*>`,
    "i",
  );
}

function findClosingTag(html: string, tag: string, from: number): number {
  const pattern = new RegExp(`<\\/?${escapeRegExp(tag)}\\b[^>]*>`, "gi");
  pattern.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }

  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
