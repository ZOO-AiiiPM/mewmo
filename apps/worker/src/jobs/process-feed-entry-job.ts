import { summarizeArticle, type ArticleSummaryInput } from "@mewmo/ai";
import {
  fetchArticleFromUrl,
  fetchFeedDocument,
  type ExtractedArticle,
  type ParsedFeedEntry,
} from "@mewmo/content";
import { getPrisma, type FeedEntryProcessJobPayload } from "@mewmo/db";

import {
  chooseFinalFeedEntryContent,
  findRssEntryByUrl,
  hasSufficientRssContent,
  type FeedEntrySourceSnapshot,
} from "../feeds/feed-entry-content";

interface FeedEntryJobPrisma {
  feedEntry: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface FeedEntryRecord {
  id: string;
  userId: string;
  title: string;
  url: string;
  content: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date | null;
  feed: {
    title: string;
    url: string;
  };
}

interface ProcessFeedEntryJobDependencies {
  prisma?: FeedEntryJobPrisma;
  fetchFeed?: (url: string) => Promise<ParsedFeedEntry[]>;
  fetchArticle?: (url: string) => Promise<ExtractedArticle>;
  summarize?: (input: ArticleSummaryInput) => Promise<string>;
}

export async function processFeedEntryJob(
  payloadValue: unknown,
  dependencies: ProcessFeedEntryJobDependencies = {},
) {
  const payload = parsePayload(payloadValue);
  const prisma =
    dependencies.prisma ?? (getPrisma() as unknown as FeedEntryJobPrisma);
  const fetchFeed = dependencies.fetchFeed ?? fetchFeedDocument;
  const fetchArticle = dependencies.fetchArticle ?? fetchArticleFromUrl;
  const summarize = dependencies.summarize ?? summarizeArticle;

  const entry = (await prisma.feedEntry.findFirst({
    where: { id: payload.entryId, userId: payload.userId, deletedAt: null },
    include: { feed: { select: { title: true, url: true } } },
  })) as FeedEntryRecord | null;
  if (!entry)
    return { status: "skipped" as const, reason: "target_not_found" as const };

  const rss = await resolveRssSnapshot(payload, entry, fetchFeed);
  let webpage: ExtractedArticle | undefined;
  if (!hasSufficientRssContent(rss.content)) {
    try {
      webpage = await fetchArticle(entry.url);
    } catch {
      webpage = undefined;
    }
  }

  const finalContent = chooseFinalFeedEntryContent(rss, webpage);
  const sourceUpdate = await prisma.feedEntry.updateMany({
    where: { id: entry.id, userId: entry.userId, deletedAt: null },
    data: {
      title: finalContent.title,
      content: finalContent.content,
      excerpt: finalContent.excerpt ?? null,
      author: finalContent.author ?? null,
      publishedAt: finalContent.publishedAt ?? null,
      ...(finalContent.coverImage
        ? { coverImage: finalContent.coverImage }
        : {}),
      version: { increment: 1 },
    },
  });
  if (sourceUpdate.count === 0)
    return { status: "skipped" as const, reason: "target_not_found" as const };

  const summary = await summarize({
    type: "feed_entry",
    title: finalContent.title,
    source: entry.feed.title,
    url: entry.url,
    content: finalContent.content,
  });
  const summaryUpdate = await prisma.feedEntry.updateMany({
    where: { id: entry.id, userId: entry.userId, deletedAt: null },
    data: { summary, version: { increment: 1 } },
  });
  if (summaryUpdate.count === 0)
    return { status: "skipped" as const, reason: "target_not_found" as const };

  return {
    status: "ok" as const,
    entryId: entry.id,
    usedWebpage: finalContent.content !== rss.content,
  };
}

async function resolveRssSnapshot(
  payload: FeedEntryProcessJobPayload,
  entry: FeedEntryRecord,
  fetchFeed: (url: string) => Promise<ParsedFeedEntry[]>,
): Promise<FeedEntrySourceSnapshot> {
  if (payload.rss) {
    const { publishedAt, ...rss } = payload.rss;
    return {
      ...rss,
      ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
    };
  }

  try {
    const source = findRssEntryByUrl(
      await fetchFeed(entry.feed.url),
      entry.url,
    );
    if (source) return source;
  } catch {
    // Older jobs may outlive a temporarily unavailable feed. Keep the saved source as the fallback.
  }

  return {
    title: entry.title,
    url: entry.url,
    content: entry.content,
    ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
    ...(entry.author ? { author: entry.author } : {}),
    ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
  };
}

function parsePayload(value: unknown): FeedEntryProcessJobPayload {
  if (!value || typeof value !== "object")
    throw new Error("Invalid feed entry job payload");
  const payload = value as Partial<FeedEntryProcessJobPayload>;
  if (
    typeof payload.userId !== "string" ||
    typeof payload.entryId !== "string"
  ) {
    throw new Error("Invalid feed entry job payload");
  }
  if (payload.rss && !isRssSnapshot(payload.rss))
    throw new Error("Invalid feed entry RSS snapshot");
  return payload as FeedEntryProcessJobPayload;
}

function isRssSnapshot(
  value: unknown,
): value is NonNullable<FeedEntryProcessJobPayload["rss"]> {
  if (!value || typeof value !== "object") return false;
  const rss = value as Record<string, unknown>;
  return [rss.title, rss.url, rss.content].every(
    (field) => typeof field === "string",
  );
}
