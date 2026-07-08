import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateClipInput {
  url: string;
  title: string;
  content: string;
  summary?: string;
  favicon?: string;
  coverImage?: string;
  excerpt?: string;
  sourceName?: string;
  author?: string;
  publishedAt?: Date;
}

export interface UpdateClipInput {
  url?: string;
  title?: string;
  content?: string;
  summary?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
}

interface ClipsClient {
  clip: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

export function createClipsRepository(client: unknown = getPrisma()) {
  const db = client as ClipsClient;

  return {
    create(userId: string, input: CreateClipInput) {
      return db.clip.create({ data: { ...input, userId } });
    },

    findByUserId(userId: string) {
      return db.clip.findMany({
        where: activeByUser(userId),
        orderBy: { updatedAt: "desc" },
      });
    },

    findById(userId: string, id: string) {
      return db.clip.findFirst({
        where: { id, ...activeByUser(userId) },
      });
    },

    update(userId: string, id: string, input: UpdateClipInput) {
      return db.clip.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.clip.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },
  };
}
