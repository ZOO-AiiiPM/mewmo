import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export type TaggableType = "note" | "clip" | "feed_entry";

export interface CreateTagInput {
  name: string;
  color?: string;
  isSystem?: boolean;
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
  isSystem?: boolean;
}

interface TagsClient {
  tag: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  taggable: {
    create(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
}

export function createTagsRepository(client: unknown = getPrisma()) {
  const db = client as TagsClient;

  async function requireTag(userId: string, tagId: string) {
    const tag = await db.tag.findFirst({
      where: { id: tagId, ...activeByUser(userId) },
    });

    if (!tag) {
      throw new Error("Tag not found");
    }

    return tag;
  }

  return {
    create(userId: string, input: CreateTagInput) {
      return db.tag.create({ data: { ...input, userId } });
    },

    findByUserId(userId: string) {
      return db.tag.findMany({
        where: activeByUser(userId),
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      });
    },

    update(userId: string, id: string, input: UpdateTagInput) {
      return db.tag.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.tag.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },

    async attachTag(userId: string, tagId: string, taggableId: string, taggableType: TaggableType) {
      await requireTag(userId, tagId);

      return db.taggable.create({
        data: { tagId, taggableId, taggableType },
      });
    },

    async detachTag(userId: string, tagId: string, taggableId: string, taggableType: TaggableType) {
      await requireTag(userId, tagId);

      return db.taggable.deleteMany({
        where: { tagId, taggableId, taggableType },
      });
    },
  };
}
