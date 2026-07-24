import type { PrototypeIconName } from "../components/shell/PrototypeIcon";
import { clipPreviewText } from "./clip-card";
import { preferredFeedCardSource, preferredFeedReaderSource } from "./feed-display";
import { normalizeListCardPreview } from "./list-card-preview";
import { notePreviewText } from "./note-list-preview";

type KnowledgeItemKind = "note" | "clip" | "feed_entry" | "asset";
type KnowledgeAssetType = "pdf" | "ebook";
export type KnowledgeContentType = "note" | "article" | "media" | "video" | "podcast" | "pdf" | "ebook";
export type KnowledgeListSortMode = "custom" | "updated" | "created";

interface KnowledgeNote {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  updatedAt?: string;
  createdAt?: string;
  version?: number;
}

interface KnowledgeClip {
  id: string;
  url: string;
  title: string;
  summary?: string | null;
  excerpt?: string | null;
  content?: string | null;
  sourceName?: string | null;
  author?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  publishedAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

interface KnowledgeFeedEntry {
  id: string;
  title: string;
  url: string;
  summary?: string | null;
  excerpt?: string | null;
  content?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  feed?: {
    title: string;
    type?: string | null;
  } | null;
}

export interface KnowledgeItemLike {
  id?: string;
  kind: KnowledgeItemKind;
  position?: number | null;
  title?: string | null;
  summary?: string | null;
  assetType?: KnowledgeAssetType | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  note?: KnowledgeNote | null;
  clip?: KnowledgeClip | null;
  feedEntry?: KnowledgeFeedEntry | null;
}

export interface KnowledgeCardView {
  title: string;
  summary: string;
  icon: PrototypeIconName;
  sourceBadge: "bookmark" | "rss" | null;
  sourceText: string;
  readerSourceText: string;
  href: string | null;
  author?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function classifyKnowledgeContentType(item: KnowledgeItemLike): KnowledgeContentType {
  if (item.kind === "note") return "note";

  if (item.kind === "asset") {
    return item.assetType === "ebook" ? "ebook" : "pdf";
  }

  if (item.kind === "feed_entry" && item.feedEntry) {
    const feedType = item.feedEntry.feed?.type;
    if (isKnowledgeFeedType(feedType)) return feedType;
    if (isVideoSource(item.feedEntry.url, item.feedEntry.sourceName)) return "video";
    if (isMediaSource(item.feedEntry.url, item.feedEntry.sourceName)) return "media";
    return "article";
  }

  if (item.kind === "clip" && item.clip) {
    if (isVideoSource(item.clip.url, item.clip.sourceName)) return "video";
    if (isMediaSource(item.clip.url, item.clip.sourceName)) return "media";
    return "article";
  }

  return "article";
}

export function sortKnowledgeItemsForList<T extends KnowledgeItemLike>(
  items: T[],
  sortMode: KnowledgeListSortMode = "created",
) {
  return [...items].sort((a, b) => {
    if (sortMode === "custom") {
      const byPosition = knowledgePosition(a) - knowledgePosition(b);
      if (byPosition !== 0) return byPosition;
    }

    const aDate = sortMode === "created" ? a.createdAt : a.updatedAt ?? a.createdAt;
    const bDate = sortMode === "created" ? b.createdAt : b.updatedAt ?? b.createdAt;
    return timestamp(bDate) - timestamp(aDate);
  });
}

export function buildKnowledgeCardView(item: KnowledgeItemLike): KnowledgeCardView {
  if (item.kind === "note" && item.note) {
    const createdAt = item.note.createdAt ?? item.createdAt;
    const updatedAt = item.note.updatedAt ?? item.updatedAt;
    return {
      title: item.note.title,
      summary: notePreviewText({
        summary: item.note.summary ?? null,
        content: item.note.content ?? "",
      }),
      icon: "note",
      sourceBadge: null,
      sourceText: "笔记",
      readerSourceText: "笔记",
      href: `/notes/${item.note.slug}`,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }

  if (item.kind === "clip" && item.clip) {
    const createdAt = item.clip.createdAt ?? item.createdAt;
    const updatedAt = item.clip.updatedAt ?? item.updatedAt;
    const contentType = classifyKnowledgeContentType(item);
    return {
      title: item.clip.title,
      summary: clipPreviewText({
        summary: item.clip.summary ?? null,
        excerpt: item.clip.excerpt ?? null,
        content: item.clip.content ?? "",
        url: item.clip.url,
      }),
      icon: knowledgeContentTypeIcon(contentType),
      sourceBadge: "bookmark",
      sourceText: item.clip.sourceName || domainFromUrl(item.clip.url),
      readerSourceText: item.clip.sourceName || domainFromUrl(item.clip.url),
      author: item.clip.author ?? null,
      publishedAt: item.clip.publishedAt ?? null,
      href: `/clips/${item.clip.id}`,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }

  if (item.kind === "feed_entry" && item.feedEntry) {
    const createdAt = item.feedEntry.createdAt ?? item.createdAt;
    const updatedAt = item.feedEntry.publishedAt ?? item.updatedAt;
    const contentType = classifyKnowledgeContentType(item);
    return {
      title: item.feedEntry.title,
      summary: clipPreviewText({
        summary: item.feedEntry.summary ?? null,
        excerpt: item.feedEntry.excerpt ?? null,
        content: item.feedEntry.content ?? "",
        url: item.feedEntry.url,
      }),
      icon: knowledgeContentTypeIcon(contentType),
      sourceBadge: "rss",
      sourceText: preferredFeedCardSource({
        feedTitle: item.feedEntry.feed?.title,
        sourceName: item.feedEntry.sourceName,
        url: item.feedEntry.url,
      }),
      readerSourceText: preferredFeedReaderSource({
        sourceName: item.feedEntry.sourceName,
        url: item.feedEntry.url,
        feedTitle: item.feedEntry.feed?.title,
      }),
      author: item.feedEntry.author ?? null,
      publishedAt: item.feedEntry.publishedAt ?? null,
      href: `/feed-entries/${item.feedEntry.id}`,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
  }

  const assetIcon = knowledgeContentTypeIcon(classifyKnowledgeContentType(item));
  const createdAt = item.createdAt;
  const updatedAt = item.updatedAt;
  return {
    title: item.title ?? "未命名文件",
    summary: previewText(item.summary),
    icon: assetIcon,
    sourceBadge: null,
    sourceText: item.sourceName ?? "从本地导入",
    readerSourceText: item.sourceName ?? "从本地导入",
    href: null,
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function previewText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const preview = normalizeListCardPreview(value ?? "");
    if (preview) return preview;
  }
  return "";
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function knowledgeContentTypeIcon(type: KnowledgeContentType): PrototypeIconName {
  if (type === "note") return "note";
  if (type === "media") return "media";
  if (type === "video") return "video";
  if (type === "podcast") return "mic";
  if (type === "pdf") return "pdf";
  if (type === "ebook") return "book";
  return "doc";
}

function isKnowledgeFeedType(value?: string | null): value is Extract<KnowledgeContentType, "article" | "media" | "video" | "podcast"> {
  return value === "article" || value === "media" || value === "video" || value === "podcast";
}

function isVideoSource(url: string, sourceName?: string | null) {
  const text = `${url} ${sourceName ?? ""}`.toLowerCase();
  return (
    text.includes("youtube") ||
    text.includes("youtu.be") ||
    text.includes("bilibili") ||
    text.includes("vimeo") ||
    text.includes("douyin") ||
    text.includes("ixigua")
  );
}

function isMediaSource(url: string, sourceName?: string | null) {
  const text = `${url} ${sourceName ?? ""}`.toLowerCase();
  return [
    "少数派",
    "sspai",
    "36kr",
    "36氪",
    "latepost",
    "晚点",
    "mp.weixin",
    "weixin",
    "微信",
    "公众号",
    "zhihu",
    "知乎",
    "xiaohongshu",
    "小红书",
    "weibo",
    "微博",
    "huxiu",
    "虎嗅",
    "ifanr",
    "爱范儿",
    "woshipm",
    "人人都是产品经理",
    "qq.com",
    "腾讯技术工程",
    "juejin",
    "掘金",
    "github.com/trending",
  ].some((item) => text.includes(item));
}

function knowledgePosition(item: KnowledgeItemLike) {
  return item.position ?? Number.MAX_SAFE_INTEGER;
}

function timestamp(value?: string) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
