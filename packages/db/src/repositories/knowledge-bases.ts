import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

const MAX_FOLDER_DEPTH = 3;

export class KnowledgeFolderDepthError extends Error {
  constructor() {
    super("knowledge folders support at most four levels");
    this.name = "KnowledgeFolderDepthError";
  }
}

export interface CreateKnowledgeBaseInput {
  title: string;
  icon?: string;
  position?: number;
}

export interface UpdateKnowledgeBaseInput {
  title?: string;
  icon?: string;
  position?: number;
}

export interface CreateKnowledgeFolderInput {
  name: string;
  parentId?: string | null;
  position?: number;
}

export interface UpdateKnowledgeFolderInput {
  name?: string;
  parentId?: string | null;
  position?: number;
}

export type ImportKnowledgeItemInput =
  | { kind: "note"; noteId: string }
  | { kind: "clip"; clipId: string }
  | { kind: "feed_entry"; feedEntryId: string };

export interface ImportKnowledgeItemsInput {
  folderId?: string | null;
  items: ImportKnowledgeItemInput[];
}

export interface CreateKnowledgeAssetInput {
  folderId?: string | null;
  title: string;
  summary?: string | null;
  assetType: "pdf" | "ebook";
  sourceName?: string | null;
  sourceUrl?: string | null;
  position?: number;
}

interface KnowledgeClient {
  knowledgeBase: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  knowledgeFolder: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  knowledgeItem: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

function itemCreateData(item: ImportKnowledgeItemInput) {
  if (item.kind === "note") return { kind: item.kind, noteId: item.noteId };
  if (item.kind === "clip") return { kind: item.kind, clipId: item.clipId };
  return { kind: item.kind, feedEntryId: item.feedEntryId };
}

export function createKnowledgeBasesRepository(client: unknown = getPrisma()) {
  const db = client as KnowledgeClient;

  return {
    create(userId: string, input: CreateKnowledgeBaseInput) {
      return db.knowledgeBase.create({
        data: {
          title: input.title,
          icon: input.icon ?? "book",
          position: input.position ?? 0,
          userId,
        },
      });
    },

    findByUserId(userId: string) {
      return db.knowledgeBase.findMany({
        where: activeByUser(userId),
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          _count: {
            select: {
              items: { where: { deletedAt: null } },
            },
          },
        },
      });
    },

    findById(userId: string, id: string) {
      return db.knowledgeBase.findFirst({
        where: { id, ...activeByUser(userId) },
      });
    },

    findTree(userId: string, id: string) {
      return db.knowledgeBase.findFirst({
        where: { id, ...activeByUser(userId) },
        include: {
          folders: {
            where: { deletedAt: null },
            orderBy: [{ depth: "asc" }, { position: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    },

    update(userId: string, id: string, input: UpdateKnowledgeBaseInput) {
      return db.knowledgeBase.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.knowledgeBase.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },

    async createFolder(userId: string, knowledgeBaseId: string, input: CreateKnowledgeFolderInput) {
      let depth = 0;
      const parentId = input.parentId ?? null;

      if (parentId) {
        const parent = (await db.knowledgeFolder.findFirst({
          where: { id: parentId, knowledgeBaseId, ...activeByUser(userId) },
        })) as { depth: number } | null;
        if (!parent) return null;
        if (parent.depth >= MAX_FOLDER_DEPTH) throw new KnowledgeFolderDepthError();
        depth = parent.depth + 1;
      }

      return db.knowledgeFolder.create({
        data: {
          name: input.name,
          parentId,
          depth,
          knowledgeBaseId,
          userId,
          position: input.position ?? 0,
        },
      });
    },

    findFolders(userId: string, knowledgeBaseId: string) {
      return db.knowledgeFolder.findMany({
        where: { knowledgeBaseId, ...activeByUser(userId) },
        orderBy: [{ depth: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      });
    },

    updateFolder(
      userId: string,
      knowledgeBaseId: string,
      id: string,
      input: UpdateKnowledgeFolderInput,
    ) {
      return db.knowledgeFolder.updateMany({
        where: { id, knowledgeBaseId, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    deleteFolder(userId: string, knowledgeBaseId: string, id: string, now = new Date()) {
      return db.knowledgeFolder.updateMany({
        where: { id, knowledgeBaseId, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },

    findContents(userId: string, knowledgeBaseId: string, folderId?: string | null) {
      return db.knowledgeItem.findMany({
        where: { knowledgeBaseId, folderId: folderId ?? null, ...activeByUser(userId) },
        include: {
          note: true,
          clip: true,
          feedEntry: { include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      });
    },

    async importItems(userId: string, knowledgeBaseId: string, input: ImportKnowledgeItemsInput) {
      const folderId = input.folderId ?? null;
      const created = [];

      for (const [index, item] of input.items.entries()) {
        created.push(
          await db.knowledgeItem.create({
            data: {
              ...itemCreateData(item),
              folderId,
              knowledgeBaseId,
              position: index,
              userId,
            },
          }),
        );
      }

      return created;
    },

    createAsset(userId: string, knowledgeBaseId: string, input: CreateKnowledgeAssetInput) {
      return db.knowledgeItem.create({
        data: {
          kind: "asset",
          assetType: input.assetType,
          title: input.title,
          summary: input.summary ?? null,
          sourceName: input.sourceName ?? null,
          sourceUrl: input.sourceUrl ?? null,
          folderId: input.folderId ?? null,
          knowledgeBaseId,
          position: input.position ?? 0,
          userId,
        },
      });
    },

    deleteItem(userId: string, knowledgeBaseId: string, id: string, now = new Date()) {
      return db.knowledgeItem.updateMany({
        where: { id, knowledgeBaseId, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },
  };
}
