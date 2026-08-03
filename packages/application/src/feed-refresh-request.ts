import { getPrisma } from "@mewmo/db";

interface FeedRefreshRequestPrisma {
  feed: {
    findFirst(args: unknown): Promise<{ lastFetchStatus: string } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface RequestFeedRefreshDependencies {
  prisma?: FeedRefreshRequestPrisma;
}

export interface FeedRefreshRequestResult {
  queued: boolean;
  status: string;
}

export async function requestFeedRefresh(
  userId: string,
  feedId: string,
  dependencies: RequestFeedRefreshDependencies = {},
): Promise<FeedRefreshRequestResult> {
  const prisma = dependencies.prisma ?? (getPrisma() as unknown as FeedRefreshRequestPrisma);
  const claim = await prisma.feed.updateMany({
    where: {
      id: feedId,
      userId,
      deletedAt: null,
      lastFetchStatus: { not: "fetching" },
    },
    data: {
      lastFetchStatus: "queued",
      lastFetchStartedAt: null,
      lastFetchError: null,
      version: { increment: 1 },
    },
  });
  if (claim.count > 0) return { queued: true, status: "queued" };

  const feed = await prisma.feed.findFirst({
    where: { id: feedId, userId, deletedAt: null },
    select: { lastFetchStatus: true },
  });
  return {
    queued: feed?.lastFetchStatus === "queued" || feed?.lastFetchStatus === "fetching",
    status: feed?.lastFetchStatus ?? "missing",
  };
}
