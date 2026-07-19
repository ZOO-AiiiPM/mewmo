import {
  stripHtml,
  type ExtractedArticle,
  type ParsedFeedEntry,
} from "@mewmo/content";

const FULL_RSS_TEXT_LENGTH = 500;
const MIN_WEB_TEXT_LENGTH = 250;
const BLOCKED_PAGE_PATTERN =
  /(?:captcha|cloudflare|verify you are human|checking your browser|access denied|attention required|enable javascript|请完成验证|人机验证|访问受限)/i;

export interface FeedEntrySourceSnapshot {
  title: string;
  url: string;
  content: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
}

export interface FinalFeedEntryContent extends FeedEntrySourceSnapshot {
  coverImage?: string;
}

export function hasSufficientRssContent(content: string) {
  return visibleText(content).length >= FULL_RSS_TEXT_LENGTH;
}

export function chooseFinalFeedEntryContent(
  rss: FeedEntrySourceSnapshot,
  webpage?: ExtractedArticle,
): FinalFeedEntryContent {
  if (!webpage || !isUsableWebArticle(webpage, rss)) return rss;

  return {
    title: isUsableWebTitle(webpage.title, rss.url) ? webpage.title : rss.title,
    url: rss.url,
    content: webpage.content,
    ...((webpage.excerpt ?? rss.excerpt)
      ? { excerpt: webpage.excerpt ?? rss.excerpt }
      : {}),
    ...((webpage.author ?? rss.author)
      ? { author: webpage.author ?? rss.author }
      : {}),
    ...((webpage.publishedAt ?? rss.publishedAt)
      ? { publishedAt: webpage.publishedAt ?? rss.publishedAt }
      : {}),
    ...(webpage.coverImage ? { coverImage: webpage.coverImage } : {}),
  };
}

export function findRssEntryByUrl(entries: ParsedFeedEntry[], url: string) {
  return entries.find((entry) => normalizeUrl(entry.url) === normalizeUrl(url));
}

function isUsableWebArticle(
  webpage: ExtractedArticle,
  rss: FeedEntrySourceSnapshot,
) {
  const webText = visibleText(webpage.content);
  const rssText = visibleText(rss.content);
  if (webText.length < MIN_WEB_TEXT_LENGTH) return false;
  if (BLOCKED_PAGE_PATTERN.test(webText.slice(0, 1_000))) return false;
  if (
    /<script\b/i.test(webpage.content) &&
    webText.length < MIN_WEB_TEXT_LENGTH * 2
  )
    return false;
  return webText.length >= rssText.length + 100;
}

function isUsableWebTitle(title: string, url: string) {
  const normalized = title.trim().toLowerCase();
  if (!normalized || BLOCKED_PAGE_PATTERN.test(normalized)) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return normalized.replace(/^www\./, "") !== hostname;
  } catch {
    return true;
  }
}

function visibleText(content: string) {
  return stripHtml(content).replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}
