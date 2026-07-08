import { getPrisma } from "@mewmo/db";

import { fetchAndStoreFeed, type FeedFetchResult } from "./feed-fetch-service";

interface DueFeed {
  id: string;
  userId: string;
  lastFetchedAt: Date | null;
  refreshInterval: number;
}

interface FeedRefreshPrisma {
  feed: {
    findMany(args: unknown): Promise<DueFeed[]>;
  };
}

export interface FeedRefreshResult {
  checked: number;
  fetched: number;
  created: number;
}

export async function refreshDueFeeds({
  now = new Date(),
  prisma = getPrisma() as FeedRefreshPrisma,
  fetchFeed = fetchAndStoreFeed,
}: {
  now?: Date;
  prisma?: FeedRefreshPrisma;
  fetchFeed?: (userId: string, feedId: string) => Promise<FeedFetchResult>;
} = {}): Promise<FeedRefreshResult> {
  const feeds = await prisma.feed.findMany({
    where: { deletedAt: null },
    select: { id: true, userId: true, lastFetchedAt: true, refreshInterval: true },
  });
  const dueFeeds = feeds.filter((feed) => {
    if (!feed.lastFetchedAt) return true;
    return feed.lastFetchedAt.getTime() <= now.getTime() - feed.refreshInterval * 1000;
  });

  let fetched = 0;
  let created = 0;
  for (const feed of dueFeeds) {
    const result = await fetchFeed(feed.userId, feed.id);
    fetched += result.fetched;
    created += result.created;
  }

  return { checked: dueFeeds.length, fetched, created };
}
