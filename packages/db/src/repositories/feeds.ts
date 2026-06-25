import { getPrisma, Prisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateFeedInput {
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  refreshInterval?: number;
}

export interface UpdateFeedInput {
  url?: string;
  title?: string;
  description?: string | null;
  favicon?: string | null;
  refreshInterval?: number;
  lastFetchedAt?: Date | null;
}

interface FeedsClient {
  feed: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
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

    findById(userId: string, id: string) {
      return db.feed.findFirst({
        where: { id, ...activeByUser(userId) },
      });
    },

    findDueForRefresh(now = new Date()) {
      return db.$queryRaw(Prisma.sql`
        SELECT *
        FROM feeds
        WHERE deleted_at IS NULL
          AND (
            last_fetched_at IS NULL
            OR last_fetched_at <= ${now}::timestamp - (refresh_interval * interval '1 second')
          )
        ORDER BY COALESCE(last_fetched_at, created_at) ASC
      `);
    },

    update(userId: string, id: string, input: UpdateFeedInput) {
      return db.feed.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.feed.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },
  };
}
