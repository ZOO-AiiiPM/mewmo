import { extractArticleBodyHtml, stripHtml } from "./html";
import { fetchOutbound, type ResolvedAddress } from "./outbound";

export interface ExtractedArticle {
  title: string;
  content: string;
  favicon?: string;
  coverImage?: string;
  excerpt?: string;
  sourceName?: string;
  author?: string;
  publishedAt?: Date;
}

export interface FetchArticleOptions {
  fetchArticle?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  allowedPrivateOrigins?: string[];
}

export async function fetchArticleFromUrl(
  url: string,
  options: FetchArticleOptions = {},
): Promise<ExtractedArticle> {
  const response = await fetchOutbound(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  }, {
    ...(options.fetchArticle ? { fetchImpl: options.fetchArticle } : {}),
    ...(options.lookupHost ? { lookupHost: options.lookupHost } : {}),
    ...(options.allowedPrivateOrigins ? { allowedPrivateOrigins: options.allowedPrivateOrigins } : {}),
  });

  if (!response.ok) throw new Error(`Failed to fetch article: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported article content type: ${contentType}`);
  }

  const html = await response.text();
  return extractArticleFromHtml(html, response.url || url);
}

export function extractArticleFromHtml(html: string, pageUrl: string): ExtractedArticle {
  const content = extractArticleBodyHtml(html);
  const title =
    readMeta(html, "property", "og:title") ||
    readMeta(html, "name", "twitter:title") ||
    readTitle(html) ||
    fallbackTitle(pageUrl);
  const rawExcerpt =
    readMeta(html, "property", "og:description") ||
    readMeta(html, "name", "description") ||
    readMeta(html, "name", "twitter:description");
  const excerpt = normalizeExcerpt(rawExcerpt) ?? summarize(content);
  const favicon = readFavicon(html, pageUrl);
  const coverImage = readCoverImage(html, pageUrl, content);
  const sourceName =
    readWeChatNickname(html) ||
    readWeChatProfileNickname(html) ||
    readMeta(html, "property", "og:site_name") ||
    fallbackTitle(pageUrl);
  const author = readAuthor(html) || readWeChatProfileNickname(html);
  const publishedAt = readPublishedAt(html);

  return {
    title,
    content,
    ...(favicon ? { favicon } : {}),
    ...(coverImage ? { coverImage } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(author ? { author } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

function readMeta(html: string, key: "name" | "property", value: string): string | undefined {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${escapeRegExp(value)}["'])[^>]*>`, "i");
  const tag = html.match(pattern)?.[0];
  if (!tag) return undefined;
  return cleanText(readAttribute(tag, "content"));
}

function readTitle(html: string): string | undefined {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanText(title);
}

function readAuthor(html: string): string | undefined {
  const author =
    readMeta(html, "property", "article:author") ||
    readMeta(html, "property", "og:article:author") ||
    readMeta(html, "name", "author") ||
    readMeta(html, "name", "twitter:creator") ||
    readElementText(html, "js_name") ||
    readClassText(html, "rich_media_meta_nickname") ||
    readClassText(html, "author");
  if (!author || /^https?:\/\//i.test(author)) return undefined;
  return author;
}

function readPublishedAt(html: string): Date | undefined {
  return (
    readWeChatPublishedAt(html) ||
    parseDateValue(readMeta(html, "property", "article:published_time")) ||
    parseDateValue(readMeta(html, "property", "og:published_time")) ||
    parseDateValue(readMeta(html, "name", "datePublished")) ||
    parseDateValue(readMeta(html, "name", "publishdate")) ||
    parseDateValue(readMeta(html, "name", "publish_date")) ||
    parseDateValue(readMeta(html, "name", "date")) ||
    parseDateValue(readTimeDateTime(html)) ||
    parseDateValue(readItemPropDate(html)) ||
    parseDateValue(readElementText(html, "publish_time")) ||
    parseDateValue(readElementText(html, "js_publish_time"))
  );
}

function readFavicon(html: string, pageUrl: string): string | undefined {
  const candidates = [
    /<link\b(?=[^>]*\brel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'])[^>]*>/gi,
    /<link\b(?=[^>]*\brel=[^>\s]*(?:icon|shortcut icon|apple-touch-icon)[^>\s]*)[^>]*>/gi,
  ];

  for (const pattern of candidates) {
    for (const match of html.matchAll(pattern)) {
      const absolute = absoluteUrl(readAttribute(match[0], "href"), pageUrl);
      if (absolute) return absolute;
    }
  }

  return absoluteUrl("/favicon.ico", pageUrl);
}

function readCoverImage(html: string, pageUrl: string, content: string): string | undefined {
  const candidates = [
    readMeta(html, "property", "og:image"),
    readMeta(html, "name", "twitter:image"),
    readScriptString(html, "cdn_url_1_1"),
    readScriptString(html, "msg_cdn_url"),
    readFirstImage(content),
  ];

  for (const item of candidates) {
    const absolute = absoluteUrl(item, pageUrl);
    if (absolute) return absolute;
  }
  return undefined;
}

function readWeChatNickname(html: string): string | undefined {
  const match = html.match(/var\s+nickname\s*=\s*htmlDecode\(["']([\s\S]*?)["']\)/i);
  return cleanText(match?.[1]);
}

function readWeChatProfileNickname(html: string): string | undefined {
  const tag = html.match(/<mp-common-profile\b[^>]*\bdata-nickname=["'][^"']+["'][^>]*>/i)?.[0];
  return tag ? cleanText(readAttribute(tag, "data-nickname")) : undefined;
}

function readScriptString(html: string, name: string): string | undefined {
  const match = html.match(new RegExp(`var\\s+${escapeRegExp(name)}\\s*=\\s*["']([\\s\\S]*?)["']`, "i"));
  return cleanText(match?.[1]);
}

function readWeChatPublishedAt(html: string): Date | undefined {
  const match = html.match(/var\s+ct\s*=\s*["'](\d+)["']/i);
  const seconds = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isFinite(seconds)) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = tag.match(pattern);
  return match ? match[1] ?? match[2] ?? match[3] : undefined;
}

function readElementText(html: string, id: string): string | undefined {
  const pattern = new RegExp(`<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bid=["']${escapeRegExp(id)}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return cleanText(stripTags(html.match(pattern)?.[2]));
}

function readClassText(html: string, className: string): string | undefined {
  const pattern = new RegExp(`<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bclass=["'][^"']*(?:^|\\s)${escapeRegExp(className)}(?:\\s|$)[^"']*["'])[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return cleanText(stripTags(html.match(pattern)?.[2]));
}

function readTimeDateTime(html: string): string | undefined {
  const tag = html.match(/<time\b(?=[^>]*\bdatetime=)[^>]*>/i)?.[0];
  return tag ? readAttribute(tag, "datetime") : undefined;
}

function readItemPropDate(html: string): string | undefined {
  const tag = html.match(/<([a-zA-Z][\w:-]*)\b(?=[^>]*\bitemprop=["']datePublished["'])[^>]*>/i)?.[0];
  if (!tag) return undefined;
  return readAttribute(tag, "content") ?? cleanText(stripTags(tag));
}

function readFirstImage(html: string): string | undefined {
  const tag = html.match(/<img\b[^>]*>/i)?.[0];
  if (!tag) return undefined;
  return readAttribute(tag, "data-src") || readAttribute(tag, "data-original") || readAttribute(tag, "src");
}

function parseDateValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const normalized = /^\d+$/.test(value) ? Number.parseInt(value, 10) * 1000 : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeExcerpt(value: string | undefined): string | undefined {
  const excerpt = cleanText(value);
  if (!excerpt) return undefined;
  return excerpt === "详尽文档" ? undefined : excerpt;
}

function summarize(html: string): string | undefined {
  const text = stripHtml(html);
  if (!text) return undefined;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function stripTags(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]+>/g, " ");
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function fallbackTitle(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return pageUrl;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
