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

export interface ReplaceFeedEntryTagInput {
  name: string;
  color?: string;
}

export class TaggableTargetNotFoundError extends Error {
  constructor() {
    super("Taggable target was not found for the current user");
    this.name = "TaggableTargetNotFoundError";
  }
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
    createMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  feedEntry: {
    findFirst(args: unknown): Promise<unknown>;
  };
  $transaction?<T>(callback: (tx: TagsClient) => Promise<T>): Promise<T>;
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

    async replaceFeedEntryTags(
      userId: string,
      feedEntryId: string,
      inputs: ReplaceFeedEntryTagInput[],
    ) {
      const entry = await db.feedEntry.findFirst({
        where: { id: feedEntryId, ...activeByUser(userId) },
        select: { id: true },
      });
      if (!entry) {
        throw new TaggableTargetNotFoundError();
      }

      const normalized = deduplicateTags(inputs);
      const run = async (tx: TagsClient) => {
        const tags = [] as Array<{ id: string; name: string; color?: string | null }>;
        for (const input of normalized) {
          const existing = (await tx.tag.findFirst({
            where: { userId, name: input.name },
          })) as { id: string; name: string; color?: string | null; deletedAt?: Date | null } | null;

          if (existing) {
            const color = input.color ?? existing.color ?? stableTagColor(input.name);
            if (existing.deletedAt || color !== existing.color) {
              await tx.tag.updateMany({
                where: { id: existing.id, userId },
                data: { deletedAt: null, color, version: { increment: 1 } },
              });
            }
            tags.push({ ...existing, color });
            continue;
          }

          const created = (await tx.tag.create({
            data: {
              userId,
              name: input.name,
              color: input.color ?? stableTagColor(input.name),
            },
          })) as { id: string; name: string; color?: string | null };
          tags.push(created);
        }

        await tx.taggable.deleteMany({
          where: { taggableId: feedEntryId, taggableType: "feed_entry" },
        });
        if (tags.length > 0) {
          await tx.taggable.createMany({
            data: tags.map((tag) => ({
              tagId: tag.id,
              taggableId: feedEntryId,
              taggableType: "feed_entry" as const,
            })),
            skipDuplicates: true,
          });
        }

        return tags;
      };

      return db.$transaction ? db.$transaction(run) : run(db);
    },
  };
}

function deduplicateTags(inputs: ReplaceFeedEntryTagInput[]) {
  const byName = new Map<string, ReplaceFeedEntryTagInput>();
  for (const input of inputs) {
    const name = input.name.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (!byName.has(key)) {
      byName.set(key, { name, ...(input.color ? { color: input.color } : {}) });
    }
  }
  return [...byName.values()];
}

function stableTagColor(name: string) {
  const colors = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#dc2626", "#db2777"];
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return colors[hash % colors.length]!;
}
