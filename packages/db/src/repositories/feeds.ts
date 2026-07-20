import { getPrisma, Prisma } from "../client";
import { activeByUser, versionedUpdateData } from "./repository-utils";

export interface CreateFeedInput {
  url: string;
  type?: "article" | "media" | "video" | "podcast";
  title: string;
  description?: string;
  favicon?: string;
  refreshInterval?: number;
}

export interface UpdateFeedInput {
  url?: string;
  type?: "article" | "media" | "video" | "podcast";
  title?: string;
  description?: string | null;
  favicon?: string | null;
  refreshInterval?: number;
  lastFetchedAt?: Date | null;
  lastFetchStartedAt?: Date | null;
  lastFetchStatus?: string;
  lastFetchError?: string | null;
  lastFetchCount?: number;
  lastSeenEntryUrl?: string | null;
}

export interface DueFeedForRefresh {
  id: string;
  userId: string;
  url: string;
  title: string;
  lastFetchedAt: Date | null;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
  lastSeenEntryUrl: string | null;
}

interface FeedsClient {
  feed: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  $queryRaw(query: unknown): Promise<unknown>;
}

export function createFeedsRepository(client: unknown = getPrisma()) {
  const db = client as FeedsClient;

  return {
    create(userId: string, input: CreateFeedInput) {
      return db.feed.create({ data: { ...input, userId } });
    },

    findByUserId(userId: string) {
      return db.feed.findMany({
        where: activeByUser(userId),
        orderBy: { createdAt: "desc" },
      });
    },

    findByUserIdWithUnreadCount(userId: string, type?: "article" | "media" | "video" | "podcast") {
      return db.feed.findMany({
        where: { ...activeByUser(userId), ...(type ? { type } : {}) },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              entries: { where: { deletedAt: null, readAt: null } },
            },
          },
        },
      });
    },

    findById(userId: string, id: string) {
      return db.feed.findFirst({
        where: { id, ...activeByUser(userId) },
      });
    },

    findDueForRefresh(now = new Date(), limit = 50) {
      const retryBefore = new Date(now.getTime() - 5 * 60_000);
      return db.$queryRaw(Prisma.sql`
        SELECT
          id,
          user_id AS "userId",
          url,
          title,
          last_fetched_at AS "lastFetchedAt",
          last_fetch_status AS "lastFetchStatus",
          last_fetch_started_at AS "lastFetchStartedAt",
          last_seen_entry_url AS "lastSeenEntryUrl"
        FROM feeds
        WHERE deleted_at IS NULL
          AND (
            last_fetch_status = 'queued'
            OR (
              last_fetch_status IN ('idle', 'success')
              AND (
                last_fetched_at IS NULL
                OR last_fetched_at <= ${now}::timestamp - (refresh_interval * interval '1 second')
              )
            )
            OR (
              last_fetch_status IN ('error', 'partial')
              AND (
                last_fetch_started_at IS NULL
                OR last_fetch_started_at <= ${retryBefore}
              )
            )
            OR (
              last_fetch_status = 'fetching'
              AND last_fetch_started_at <= ${retryBefore}
            )
          )
        ORDER BY COALESCE(last_fetch_started_at, last_fetched_at, created_at) ASC
        LIMIT ${limit}
      `) as Promise<DueFeedForRefresh[]>;
    },

    update(userId: string, id: string, input: UpdateFeedInput) {
      return db.feed.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string) {
      return db.feed.deleteMany({
        where: { id, ...activeByUser(userId) },
      });
    },

    purgeDeletedDuplicate(
      userId: string,
      url: string,
      type: "article" | "media" | "video" | "podcast",
    ) {
      return db.feed.deleteMany({
        where: {
          userId,
          url,
          type,
          deletedAt: { not: null },
        },
      });
    },
  };
}
