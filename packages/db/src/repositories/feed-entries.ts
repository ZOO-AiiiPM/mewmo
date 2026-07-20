import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateFeedEntryInput {
  feedId: string;
  title: string;
  url: string;
  content: string;
  summary?: string;
  coverImage?: string;
  excerpt?: string;
  sourceName?: string;
  author?: string;
  publishedAt?: Date;
}

export interface UpdateFeedEntryInput {
  title?: string;
  url?: string;
  content?: string;
  summary?: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  readAt?: Date | null;
}

export type UpsertFeedEntrySourceInput = Omit<CreateFeedEntryInput, "summary">;

interface FeedEntriesClient {
  feedEntry: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<unknown>;
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
        include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    findByUserFeedType(userId: string, type: "article" | "media" | "video" | "podcast") {
      return db.feedEntry.findMany({
        where: {
          ...activeByUser(userId),
          feed: { ...activeByUser(userId), type },
        },
        include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
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

    markAsUnread(userId: string, id: string) {
      return db.feedEntry.updateMany({
        where: { id, ...activeByUser(userId) },
        data: { readAt: null, version: { increment: 1 } },
      });
    },

    async upsertByFeedUrl(userId: string, input: CreateFeedEntryInput) {
      const existing = await db.feedEntry.findFirst({
        where: { feedId: input.feedId, url: input.url, userId },
      });
      const entry = await db.feedEntry.upsert({
        where: { feedId_url: { feedId: input.feedId, url: input.url } },
        create: { ...input, userId },
        update: {
          title: input.title,
          content: input.content,
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          coverImage: input.coverImage ?? null,
          excerpt: input.excerpt ?? null,
          sourceName: input.sourceName ?? null,
          author: input.author ?? null,
          publishedAt: input.publishedAt ?? null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });

      return { entry, created: !existing };
    },

    async upsertSourceByFeedUrl(userId: string, input: UpsertFeedEntrySourceInput) {
      const existing = await db.feedEntry.findFirst({
        where: { feedId: input.feedId, url: input.url, userId },
      });
      const entry = await db.feedEntry.upsert({
        where: { feedId_url: { feedId: input.feedId, url: input.url } },
        create: { ...input, summary: null, userId },
        update: {
          title: input.title,
          content: input.content,
          coverImage: input.coverImage ?? null,
          excerpt: input.excerpt ?? null,
          sourceName: input.sourceName ?? null,
          author: input.author ?? null,
          publishedAt: input.publishedAt ?? null,
          deletedAt: null,
          version: { increment: 1 },
        },
      });

      return { entry, created: !existing };
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
