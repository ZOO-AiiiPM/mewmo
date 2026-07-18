import { normalizeExternalTitle } from "@mewmo/content";
import { decodeHTMLStrict } from "entities";

export type FeedType = "article" | "media" | "video" | "podcast";

export interface DiscoveredFeed {
  title: string;
  url: string;
  siteUrl?: string;
  description?: string;
  favicon?: string;
  type: FeedType;
  sourceKind: "RSS 源" | "网站 · 自动发现源" | "自部署实例";
}

export class FeedSearchProviderNotConfiguredError extends Error {
  constructor() {
    super("Feed search provider is not configured");
  }
}

interface SearchResult {
  title?: string;
  url?: string;
  description?: string;
}

interface DiscoverDeps {
  fetchFeed?: typeof fetch;
  searchEndpoint?: string;
  searchApiKey?: string;
}

const FEED_CONTENT_TYPES = ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"];

export async function discoverFeeds(query: string, deps: DiscoverDeps = {}): Promise<DiscoveredFeed[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const fetchFeed = deps.fetchFeed ?? fetch;
  if (isLikelyUrl(normalized)) {
    return discoverFromUrl(toUrl(normalized), fetchFeed);
  }

  const endpoint = deps.searchEndpoint ?? process.env.FEED_SEARCH_ENDPOINT;
  if (!endpoint) throw new FeedSearchProviderNotConfiguredError();

  const response = await fetchFeed(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(deps.searchApiKey ?? process.env.FEED_SEARCH_API_KEY
        ? { authorization: `Bearer ${deps.searchApiKey ?? process.env.FEED_SEARCH_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ query: normalized }),
  });

  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as { results?: SearchResult[] } | null;
  const results = payload?.results?.filter((item): item is SearchResult & { url: string } => Boolean(item.url)) ?? [];
  const discovered: DiscoveredFeed[] = [];

  for (const result of results.slice(0, 5)) {
    const feeds = await discoverFromUrl(result.url, fetchFeed, result).catch(() => []);
    discovered.push(...feeds);
  }

  return dedupe(discovered);
}

async function discoverFromUrl(url: string, fetchFeed: typeof fetch, fallback?: SearchResult): Promise<DiscoveredFeed[]> {
  const response = await fetchFeed(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) return [];

  const finalUrl = response.url || url;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text();

  if (isFeedDocument(contentType, text)) {
    const siteUrl = readFeedLink(text);
    const description = readFeedDescription(text) ?? fallback?.description;
    const favicon = siteUrl
      ? await readSiteFavicon(siteUrl, finalUrl, fetchFeed)
      : undefined;
    return [
      {
        title: readFeedTitle(text) ?? normalizedTitle(fallback?.title) ?? hostname(finalUrl),
        url: finalUrl,
        ...(siteUrl ? { siteUrl } : {}),
        ...(description ? { description } : {}),
        ...(favicon ? { favicon } : {}),
        type: detectFeedType(finalUrl),
        sourceKind: feedSourceKind(finalUrl),
      },
    ];
  }

  const links = readAlternateFeeds(text, finalUrl);
  if (links.length > 0) {
    const favicon = readFavicon(text, finalUrl);
    const description = readMetaDescription(text) ?? fallback?.description;
    return links.map((link) => ({
      title: link.title ?? readHtmlTitle(text) ?? normalizedTitle(fallback?.title) ?? hostname(finalUrl),
      url: link.href,
      siteUrl: finalUrl,
      ...(description ? { description } : {}),
      ...(favicon ? { favicon } : {}),
      type: detectFeedType(`${finalUrl} ${link.title ?? ""}`),
      sourceKind: "网站 · 自动发现源",
    }));
  }

  return [];
}

async function readSiteFavicon(siteUrl: string, feedUrl: string, fetchFeed: typeof fetch): Promise<string | undefined> {
  if (normalizeUrl(siteUrl) === normalizeUrl(feedUrl)) return undefined;

  try {
    const response = await fetchFeed(siteUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
      headers: {
        accept: "text/html,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });
    if (!response.ok) return undefined;
    const finalUrl = response.url || siteUrl;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html")) return undefined;
    return readFavicon(await response.text(), finalUrl);
  } catch {
    return undefined;
  }
}

function isFeedDocument(contentType: string, text: string) {
  return FEED_CONTENT_TYPES.some((type) => contentType.includes(type)) || /^\s*<(rss|feed)\b/i.test(text);
}

function readAlternateFeeds(html: string, baseUrl: string) {
  const links: Array<{ href: string; title?: string }> = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = readAttribute(tag, "rel")?.toLowerCase() ?? "";
    const type = readAttribute(tag, "type")?.toLowerCase() ?? "";
    const href = absoluteUrl(readAttribute(tag, "href"), baseUrl);
    if (!href || !rel.includes("alternate")) continue;
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) continue;
    const title = normalizedTitle(readAttribute(tag, "title"));
    links.push({ href, ...(title ? { title } : {}) });
  }
  return links;
}

function readFeedTitle(xml: string) {
  return normalizedTitle(xml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function readFeedDescription(xml: string) {
  return cleanText(
    xml.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1] ??
      xml.match(/<subtitle\b[^>]*>([\s\S]*?)<\/subtitle>/i)?.[1],
  );
}

function readFeedLink(xml: string) {
  return cleanText(xml.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]);
}

function readHtmlTitle(html: string) {
  return normalizedTitle(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function readMetaDescription(html: string) {
  const tag = html.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i)?.[0];
  return tag ? cleanText(readAttribute(tag, "content")) : undefined;
}

function readFavicon(html: string, baseUrl: string) {
  for (const match of html.matchAll(/<link\b(?=[^>]*\brel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'])[^>]*>/gi)) {
    const icon = absoluteUrl(readAttribute(match[0], "href"), baseUrl);
    if (icon) return icon;
  }
  return absoluteUrl("/favicon.ico", baseUrl);
}

function detectFeedType(value: string): FeedType {
  const text = value.toLowerCase();
  if (/youtube|youtu\.be|bilibili|b23\.tv|vimeo|视频/.test(text)) return "video";
  if (/podcast|xiaoyuzhou|小宇宙|ximalaya|anchor|播客/.test(text)) return "podcast";
  if (/mp\.weixin|weixin|公众号|weibo|微博|x\.com|twitter|zhihu|知乎|xiaohongshu|小红书|媒体|latepost|sspai|少数派/.test(text)) return "media";
  return "article";
}

function feedSourceKind(url: string): DiscoveredFeed["sourceKind"] {
  const text = url.toLowerCase();
  if (/:\d{4,5}(\/|$)/.test(text) || /freshrss|miniflux|tt-rss|selfhost/.test(text)) return "自部署实例";
  return "RSS 源";
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`, "i");
  const match = tag.match(pattern);
  return match ? match[1] ?? match[2] ?? match[3] : undefined;
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

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(value);
}

function toUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^www\./i, "www.")}`;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dedupe(feeds: DiscoveredFeed[]) {
  const seen = new Set<string>();
  return feeds.filter((feed) => {
    if (seen.has(feed.url)) return false;
    seen.add(feed.url);
    return true;
  });
}

function cleanText(value: string | undefined) {
  if (!value) return undefined;
  const text = decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function normalizedTitle(value: string | undefined) {
  if (!value) return undefined;
  const title = normalizeExternalTitle(value);
  return title || undefined;
}

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&[a-z][a-z0-9]+;/gi, (entity) => decodeHTMLStrict(entity))
    .replace(/&#(\d+);/g, (entity, code) => decodeNumericEntity(entity, code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeNumericEntity(entity, code, 16));
}

function decodeNumericEntity(entity: string, code: string, radix: number) {
  const point = Number.parseInt(code, radix);
  if (!Number.isInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
    return entity;
  }
  return String.fromCodePoint(point);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
