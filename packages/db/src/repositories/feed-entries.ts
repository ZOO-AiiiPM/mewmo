import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateFeedEntryInput {
  feedId: string;
  title: string;
  url: string;
  content: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
}

export interface UpdateFeedEntryInput {
  title?: string;
  url?: string;
  content?: string;
  summary?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  readAt?: Date | null;
}

interface FeedEntriesClient {
  feedEntry: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

export function createFeedEntriesRepository(client: unknown = getPrisma()) {
  const db = client as FeedEntriesClient;

  return {
    create(userId: string, input: CreateFeedEntryInput) {
      return db.feedEntry.create({ data: { ...input, userId } });
    },

    findByFeedId(userId: string, feedId: string) {
      return db.feedEntry.findMany({
        where: { feedId, ...activeByUser(userId) },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    findById(userId: string, id: string) {
      return db.feedEntry.findFirst({
        where: { id, ...activeByUser(userId) },
      });
    },

    markAsRead(userId: string, id: string, readAt = new Date()) {
      return db.feedEntry.updateMany({
        where: { id, ...activeByUser(userId) },
        data: { readAt, version: { increment: 1 } },
      });
    },

    update(userId: string, id: string, input: UpdateFeedEntryInput) {
      return db.feedEntry.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.feedEntry.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },
  };
}
