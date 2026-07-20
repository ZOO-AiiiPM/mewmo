import { fetchArticleFromUrl, type ExtractedArticle } from "@mewmo/content";
import { getPrisma } from "@mewmo/db";

import {
  chooseFinalFeedEntryContent,
  hasSufficientRssContent,
  type FeedEntrySourceSnapshot,
} from "./feed-entry-content";

interface FeedEntryPrisma {
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
  version: number;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date | null;
  feed: { title: string };
}

export interface ProcessFeedEntryInput {
  userId: string;
  entryId: string;
  rss?: FeedEntrySourceSnapshot;
}

interface ProcessFeedEntryDependencies {
  prisma?: FeedEntryPrisma;
  fetchArticle?: (url: string) => Promise<ExtractedArticle>;
}

export async function processFeedEntry(
  input: ProcessFeedEntryInput,
  dependencies: ProcessFeedEntryDependencies = {},
) {
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as FeedEntryPrisma);
  const fetchArticle = dependencies.fetchArticle ?? fetchArticleFromUrl;
  const entry = (await prisma.feedEntry.findFirst({
    where: { id: input.entryId, userId: input.userId, deletedAt: null },
    include: { feed: { select: { title: true } } },
  })) as FeedEntryRecord | null;
  if (!entry) return { status: "skipped" as const, reason: "target_not_found_or_completed" as const };

  const saved: FeedEntrySourceSnapshot = {
    title: entry.title,
    url: entry.url,
    content: entry.content,
    ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
    ...(entry.author ? { author: entry.author } : {}),
    ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
  };
  const source = hasSufficientRssContent(saved.content) ? saved : (input.rss ?? saved);
  let webpage: ExtractedArticle | undefined;
  if (!hasSufficientRssContent(source.content)) {
    try {
      webpage = await fetchArticle(entry.url);
    } catch {
      webpage = undefined;
    }
  }

  const finalContent = chooseFinalFeedEntryContent(source, webpage);
  const sourceUpdate = await prisma.feedEntry.updateMany({
    where: { id: entry.id, userId: entry.userId, deletedAt: null, version: entry.version },
    data: {
      title: finalContent.title,
      content: finalContent.content,
      excerpt: finalContent.excerpt ?? null,
      author: finalContent.author ?? null,
      publishedAt: finalContent.publishedAt ?? null,
      ...(finalContent.coverImage ? { coverImage: finalContent.coverImage } : {}),
      version: { increment: 1 },
    },
  });
  if (sourceUpdate.count === 0) return { status: "skipped" as const, reason: "version_changed" as const };

  return {
    status: "ok" as const,
    entryId: entry.id,
    userId: entry.userId,
    version: entry.version + 1,
    usedWebpage: finalContent.content !== source.content,
  };
}
