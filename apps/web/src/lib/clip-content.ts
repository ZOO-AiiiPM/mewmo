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

const RICH_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "section",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);
const DROP_WITH_CONTENT = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "math",
]);

const DROP_CLASS_PATTERN =
  /(?:^|\s)(?:article__footer|article--bottomActions|article--actions|article--copyright|comment__footer__wrapper|common__comment__brief|emoji__reaction__list|emoji__reaction__item|fixed--posts|js-star|postFooterInfo|relatedPosts|yyp--fancyPost)(?:\s|$)/i;

const STYLE_PROPS = new Set([
  "background",
  "background-color",
  "border-radius",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "max-width",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "text-align",
  "text-decoration",
  "visibility",
  "width",
]);

type ClipBodySelector =
  | { kind: "id"; value: string }
  | { kind: "class"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "attr"; name: string; value: string };

export function extractClipBodyHtml(html: string): string {
  const source = html.trim();
  if (!source) return "";
  if (!/^<(?:!doctype|html)\b/i.test(source)) return html;

  for (const selector of BODY_SELECTORS) {
    const body = extractElementInnerHtml(source, selector);
    const textLength = body ? stripHtml(body).length : 0;
    if (
      body &&
      (selector.kind === "id" || selector.kind === "class" || textLength > 20)
    )
      return body.trim();
  }

  return (
    extractElementInnerHtml(source, { kind: "tag", value: "body" })?.trim() ??
    html
  );
}

interface SanitizeClipHtmlOptions {
  proxyImages?: boolean;
}

export function sanitizeClipHtml(
  html: string,
  baseUrl = "https://example.com/",
  options: SanitizeClipHtmlOptions = {},
): string {
  if (!html) return "";

  let safe = dropElementsWithMatchingClass(html, DROP_CLASS_PATTERN);
  for (const tag of DROP_WITH_CONTENT) {
    safe = safe.replace(
      new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"),
      "",
    );
    safe = safe.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  safe = replaceEmojiImages(safe);
  safe = dropSspaiPromoBlocks(safe);

  return safe.replace(
    /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)([^>]*)>/g,
    (match, rawTag, rawAttrs) => {
      if (!rawTag) return "";
      const tag = rawTag.toLowerCase();
      if (!RICH_TAGS.has(tag)) return "";

      const isClosing = /^<\//.test(match);
      if (isClosing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;

      const attrs = parseAttributes(rawAttrs ?? "");
      const attrText = sanitizeAttributes(tag, attrs, baseUrl, options);
      if (attrText === null) return "";
      const suffix = VOID_TAGS.has(tag) ? "" : "";
      return `<${tag}${attrText}${suffix}>`;
    },
  );
}

function dropSspaiPromoBlocks(html: string): string {
  let safe = html;
  let changed = true;

  while (changed) {
    changed = false;
    const openTagPattern =
      /<([a-zA-Z][\w:-]*)\b(?=[^>]*\bclass=["'][^"']*\barticle__main__content\b)([^>]*)>/gi;
    let match: RegExpExecArray | null;

    while ((match = openTagPattern.exec(safe))) {
      const tag = match[1]?.toLowerCase();
      if (!tag) continue;

      const start = match.index;
      const openEnd = start + match[0].length;
      const closeStart = findClosingTag(safe, tag, openEnd);
      if (closeStart === -1) continue;

      const closeEnd = safe.indexOf(">", closeStart);
      const block = safe.slice(start, closeEnd + 1);
      const text = stripHtml(block).replace(/\s+/g, "");
      const isPromo =
        text.length < 160 &&
        text.includes("下载少数派") &&
        (text.includes("少数派公众号") || text.includes("正版软件"));

      if (!isPromo) continue;
      safe = safe.slice(0, start) + safe.slice(closeEnd + 1);
      changed = true;
      break;
    }
  }

  return safe;
}

export function isNeutralInlineColor(color: string): boolean {
  const channels = parseInlineRgbColor(color);
  if (!channels) return false;

  return Math.max(channels.r, channels.g, channels.b) - Math.min(channels.r, channels.g, channels.b) < 30;
}

export function isLightNeutralInlineColor(color: string): boolean {
  const channels = parseInlineRgbColor(color);
  if (!channels || channels.alpha <= 0.2) return false;
  const luminance = (channels.r + channels.g + channels.b) / 3;
  return isNeutralInlineColor(color) && luminance >= 200;
}

function parseInlineRgbColor(
  color: string,
): { r: number; g: number; b: number; alpha: number } | null {
  const value = color.trim();
  if (!value) return null;

  const rgb = value.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)(?:\s+|,\s*)(\d+(?:\.\d+)?)(?:\s+|,\s*)(\d+(?:\.\d+)?)(?:\s*(?:\/|,)\s*([\d.]+%?))?\s*\)/i,
  );
  if (rgb) {
    const alphaText = rgb[4];
    const alpha = alphaText
      ? alphaText.endsWith("%")
        ? Number.parseFloat(alphaText) / 100
        : Number.parseFloat(alphaText)
      : 1;
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      alpha: Number.isFinite(alpha) ? alpha : 1,
    };
  }

  if (!value.startsWith("#")) return null;
  const hex = value.slice(1);
  const expandedHex = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  const parts =
    expandedHex.length === 6
      ? [
          expandedHex.slice(0, 2),
          expandedHex.slice(2, 4),
          expandedHex.slice(4, 6),
        ]
      : null;
  if (!parts) return null;
  const [r, g, b] = parts.map((item) => Number.parseInt(item, 16));
  if (
    r === undefined ||
    g === undefined ||
    b === undefined ||
    !Number.isFinite(r) ||
    !Number.isFinite(g) ||
    !Number.isFinite(b)
  )
    return null;
  return { r, g, b, alpha: 1 };
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

function extractElementInnerHtml(
  html: string,
  selector: ClipBodySelector,
): string | null {
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

function buildOpenTagMatcher(selector: ClipBodySelector): RegExp {
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

function dropElementsWithMatchingClass(html: string, pattern: RegExp): string {
  let safe = html;
  let changed = true;

  while (changed) {
    changed = false;
    const openTagPattern =
      /<([a-zA-Z][\w:-]*)\b(?=[^>]*\bclass\s*=)([^>]*)>/gi;
    let match: RegExpExecArray | null;

    while ((match = openTagPattern.exec(safe))) {
      const tag = match[1]?.toLowerCase();
      const rawAttrs = match[2] ?? "";
      const classes = parseAttributes(rawAttrs).get("class") ?? "";
      if (!tag || !pattern.test(classes)) continue;

      const start = match.index;
      const openEnd = start + match[0].length;
      if (VOID_TAGS.has(tag) || /\/>$/.test(match[0])) {
        safe = safe.slice(0, start) + safe.slice(openEnd);
        changed = true;
        break;
      }

      const closeStart = findClosingTag(safe, tag, openEnd);
      if (closeStart === -1) {
        safe = safe.slice(0, start);
        changed = true;
        break;
      }

      const closeEnd = safe.indexOf(">", closeStart);
      safe = safe.slice(0, start) + safe.slice(closeEnd + 1);
      changed = true;
      break;
    }
  }

  return safe;
}

function parseAttributes(rawAttrs: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrPattern =
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(rawAttrs))) {
    const name = match[1];
    if (!name) continue;
    attrs.set(name.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function sanitizeAttributes(
  tag: string,
  attrs: Map<string, string>,
  baseUrl: string,
  options: SanitizeClipHtmlOptions,
): string | null {
  const safe: string[] = [];
  const title = attrs.get("title");
  if (title) safe.push(`title="${escapeAttribute(title)}"`);

  if (tag === "a") {
    const href = safeUrl(attrs.get("href") ?? "", false, baseUrl);
    if (href) {
      safe.push(`href="${escapeAttribute(href)}"`);
      safe.push('target="_blank"');
      safe.push('rel="noreferrer noopener"');
    }
  }

  if (tag === "img") {
    const rawSrc = readImageSource(attrs);
    const src = safeUrl(rawSrc, true, baseUrl);
    if (!src) return null;
    safe.push(
      `src="${escapeAttribute(options.proxyImages ? proxiedSanitizedImageUrl(src) : src)}"`,
    );
    safe.push(`alt="${escapeAttribute(attrs.get("alt") ?? "")}"`);
    safe.push('loading="lazy"');
    safe.push('referrerpolicy="no-referrer"');

    const cls = attrs.get("class") ?? "";
    if (
      cls.includes("wechat-emoji") ||
      src.includes("res.wx.qq.com/t/wx_fed/we-emoji/")
    ) {
      safe.push('class="mewmo-inline-emoji wechat-emoji"');
    } else if (isInlineEmojiImage(attrs, src)) {
      safe.push('class="mewmo-inline-emoji"');
    }
  }

  let style = sanitizeStyle(attrs.get("style") ?? "");
  if (tag === "table" || tag === "th" || tag === "td") {
    style = style
      .split(";")
      .filter((chunk) => {
        const prop = chunk.split(":")[0]?.trim().toLowerCase();
        return (
          prop &&
          prop !== "width" &&
          prop !== "max-width" &&
          prop !== "min-width"
        );
      })
      .join("; ")
      .trim();
  }
  if (style) safe.push(`style="${escapeAttribute(style)}"`);

  return safe.length ? ` ${safe.join(" ")}` : "";
}

function safeUrl(raw: string, image: boolean, baseUrl: string): string | null {
  const value = decodeHtmlEntities(raw).trim();
  if (!value) return null;
  if (value.startsWith("#")) return value;
  if (image && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(value))
    return value;

  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    if (!image && (url.protocol === "mailto:" || url.protocol === "tel:"))
      return url.href;
    if (image && (url.protocol === "asset:" || url.protocol === "blob:"))
      return value;
  } catch {
    return null;
  }
  return null;
}

function readImageSource(attrs: Map<string, string>): string {
  for (const name of [
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-actualsrc",
    "src",
  ]) {
    const value = attrs.get(name)?.trim();
    if (value && !isTransparentPlaceholderImage(value)) return value;
  }

  const srcset = attrs.get("srcset")?.trim();
  const firstSrc = srcset?.split(",")[0]?.trim().split(/\s+/)[0];
  return firstSrc && !isTransparentPlaceholderImage(firstSrc) ? firstSrc : "";
}

function isTransparentPlaceholderImage(value: string): boolean {
  const src = value.trim();
  return /^data:image\/gif;base64,R0lGOD/i.test(src) && src.length < 200;
}

function proxiedSanitizedImageUrl(src: string): string {
  if (/^(?:data:image\/|blob:|asset:)/i.test(src)) return src;
  try {
    const url = new URL(src);
    if (url.protocol !== "http:" && url.protocol !== "https:") return src;
    return `/api/image-proxy?url=${encodeURIComponent(url.href)}`;
  } catch {
    return src;
  }
}

function isInlineEmojiImage(attrs: Map<string, string>, src: string): boolean {
  const cls = attrs.get("class")?.toLowerCase() ?? "";
  if (/\b(?:emoji|emoticon|qqemoji|wx-emoji|wechat-emoji)\b/.test(cls))
    return true;
  if (/emoji|emoticon|qqemoji|we-emoji/i.test(src)) return true;

  const alt = attrs.get("alt") ?? attrs.get("title") ?? "";
  if (/\p{Extended_Pictographic}/u.test(alt)) return true;

  const width =
    readImageDimension(attrs.get("width")) ??
    readStyleDimension(attrs.get("style") ?? "", "width");
  const height =
    readImageDimension(attrs.get("height")) ??
    readStyleDimension(attrs.get("style") ?? "", "height");
  if (width && height) return width <= 80 && height <= 80;

  const shortAlt = alt.trim().length > 0 && alt.trim().length <= 4;
  const compactWidth = Boolean(width && width <= 80);
  const compactHeight = Boolean(height && height <= 80);
  return shortAlt && (compactWidth || compactHeight);
}

function readImageDimension(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)/);
  return match?.[1] ? Number(match[1]) : null;
}

function readStyleDimension(
  style: string,
  prop: "width" | "height",
): number | null {
  const pattern = new RegExp(`${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i");
  const match = style.match(pattern);
  return match?.[1] ? Number(match[1]) : null;
}

function sanitizeStyle(style: string): string {
  const safe: string[] = [];
  for (const chunk of style.split(";")) {
    const [rawProp, ...rest] = chunk.split(":");
    if (!rawProp || rest.length === 0) continue;

    const prop = rawProp.trim().toLowerCase();
    const value = rest
      .join(":")
      .replace(/!important/gi, "")
      .trim();
    const lower = value.toLowerCase();
    if (!STYLE_PROPS.has(prop)) continue;
    if (
      lower.includes("expression(") ||
      lower.includes("javascript:") ||
      lower.includes("url(") ||
      /[<>"\\]/.test(value)
    )
      continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join("; ");
}

function replaceEmojiImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const attrs = parseAttributes(tag);
    const cls = attrs.get("class") ?? "";
    const src = attrs.get("src") ?? "";
    if (
      cls.includes("wp-smiley") ||
      src.includes("s.w.org/images/core/emoji")
    ) {
      return escapeHtml(attrs.get("alt") ?? "");
    }
    return tag;
  });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
