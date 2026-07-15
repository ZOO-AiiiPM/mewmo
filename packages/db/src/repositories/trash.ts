import { getPrisma } from "../client";

export const TRASH_RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export const trashKindValues = ["note", "clip", "feed", "knowledge_base"] as const;
export type TrashKind = (typeof trashKindValues)[number];

export interface TrashItem {
  type: TrashKind;
  id: string;
  title: string;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  expiresAt: Date;
  url?: string | null;
  icon?: string | null;
  feedType?: string | null;
  content?: string;
  description?: string | null;
  excerpt?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
}

interface DeletedRecord {
  id: string;
  title: string | null;
  summary?: string | null;
  description?: string | null;
  content?: string;
  url?: string | null;
  icon?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
  type?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface TrashModelClient {
  findMany?(args: unknown): Promise<DeletedRecord[]>;
  findFirst?(args: unknown): Promise<DeletedRecord | null>;
  updateMany?(args: unknown): Promise<{ count: number }>;
  deleteMany?(args: unknown): Promise<{ count: number }>;
}

interface TrashClient {
  note: TrashModelClient;
  clip: TrashModelClient;
  feed: TrashModelClient;
  knowledgeBase: TrashModelClient;
}

const noteSelect = {
  id: true,
  title: true,
  summary: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

const clipSelect = {
  id: true,
  url: true,
  title: true,
  summary: true,
  excerpt: true,
  favicon: true,
  coverImage: true,
  sourceName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

const feedSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  favicon: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

const knowledgeBaseSelect = {
  id: true,
  title: true,
  icon: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

const noteDetailSelect = {
  ...noteSelect,
  content: true,
};

const clipDetailSelect = {
  ...clipSelect,
  content: true,
  author: true,
  publishedAt: true,
};

function detailSelectFor(kind: TrashKind) {
  if (kind === "note") return noteDetailSelect;
  if (kind === "clip") return clipDetailSelect;
  if (kind === "feed") return feedSelect;
  return knowledgeBaseSelect;
}

function retentionCutoff(now: Date) {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
}

function expiresAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

function delegateFor(db: Partial<TrashClient>, kind: TrashKind) {
  if (kind === "note") return db.note;
  if (kind === "clip") return db.clip;
  if (kind === "feed") return db.feed;
  return db.knowledgeBase;
}

function toTrashItem(kind: TrashKind, record: DeletedRecord): TrashItem | null {
  if (!record.deletedAt) return null;

  const summary =
    record.summary ??
    record.description ??
    record.sourceName ??
    null;

  return {
    type: kind,
    id: record.id,
    title: record.title || "Untitled",
    summary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    expiresAt: expiresAt(record.deletedAt),
    ...(record.url !== undefined ? { url: record.url } : {}),
    ...(record.icon !== undefined ? { icon: record.icon } : {}),
    ...(record.type !== undefined ? { feedType: record.type } : {}),
    ...(record.content !== undefined ? { content: record.content } : {}),
    ...(record.description !== undefined ? { description: record.description } : {}),
    ...(record.excerpt !== undefined ? { excerpt: record.excerpt } : {}),
    ...(record.favicon !== undefined ? { favicon: record.favicon } : {}),
    ...(record.coverImage !== undefined ? { coverImage: record.coverImage } : {}),
    ...(record.sourceName !== undefined ? { sourceName: record.sourceName } : {}),
    ...(record.author !== undefined ? { author: record.author } : {}),
    ...(record.publishedAt !== undefined ? { publishedAt: record.publishedAt } : {}),
  };
}

function sortByDeletedAtDesc(left: TrashItem, right: TrashItem) {
  return right.deletedAt.getTime() - left.deletedAt.getTime();
}

export function createTrashRepository(client: unknown = getPrisma()) {
  const db = client as Partial<TrashClient>;

  async function cleanupExpired(userId: string, now = new Date()) {
    const cutoff = retentionCutoff(now);
    const where = { userId, deletedAt: { lte: cutoff } };

    await Promise.all([
      db.note?.deleteMany?.({ where }),
      db.clip?.deleteMany?.({ where }),
      db.feed?.deleteMany?.({ where }),
      db.knowledgeBase?.deleteMany?.({ where }),
    ]);
  }

  return {
    cleanupExpired,

    async list(userId: string, now = new Date()) {
      await cleanupExpired(userId, now);

      const [notes, clips, feeds, knowledgeBases] = await Promise.all([
        db.note?.findMany?.({
          where: { userId, deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
          select: noteSelect,
        }) ?? Promise.resolve([]),
        db.clip?.findMany?.({
          where: { userId, deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
          select: clipSelect,
        }) ?? Promise.resolve([]),
        db.feed?.findMany?.({
          where: { userId, deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
          select: feedSelect,
        }) ?? Promise.resolve([]),
        db.knowledgeBase?.findMany?.({
          where: { userId, deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
          select: knowledgeBaseSelect,
        }) ?? Promise.resolve([]),
      ]);

      return [
        ...notes.map((item) => toTrashItem("note", item)),
        ...clips.map((item) => toTrashItem("clip", item)),
        ...feeds.map((item) => toTrashItem("feed", item)),
        ...knowledgeBases.map((item) => toTrashItem("knowledge_base", item)),
      ].filter((item): item is TrashItem => Boolean(item)).sort(sortByDeletedAtDesc);
    },

    async get(userId: string, kind: TrashKind, id: string) {
      const record = await delegateFor(db, kind)?.findFirst?.({
        where: { id, userId, deletedAt: { not: null } },
        select: detailSelectFor(kind),
      });
      return record ? toTrashItem(kind, record) : null;
    },

    async restore(userId: string, kind: TrashKind, id: string) {
      const result = await delegateFor(db, kind)?.updateMany?.({
        where: { id, userId, deletedAt: { not: null } },
        data: { deletedAt: null, version: { increment: 1 } },
      });
      return Boolean(result?.count);
    },

    async deletePermanently(userId: string, kind: TrashKind, id: string) {
      const result = await delegateFor(db, kind)?.deleteMany?.({
        where: { id, userId, deletedAt: { not: null } },
      });
      return Boolean(result?.count);
    },
  };
}
