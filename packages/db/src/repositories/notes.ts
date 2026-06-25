import { getPrisma, Prisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateNoteInput {
  slug: string;
  title: string;
  content: string;
  summary?: string;
  pinned?: boolean;
}

export interface UpdateNoteInput {
  slug?: string;
  title?: string;
  content?: string;
  summary?: string | null;
  pinned?: boolean;
}

interface NotesClient {
  note: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  $queryRaw(query: unknown): Promise<unknown>;
}

export function createNotesRepository(client: unknown = getPrisma()) {
  const db = client as NotesClient;

  return {
    create(userId: string, input: CreateNoteInput) {
      return db.note.create({ data: { ...input, userId } });
    },

    findByUserId(userId: string) {
      return db.note.findMany({
        where: activeByUser(userId),
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      });
    },

    findBySlug(userId: string, slug: string) {
      return db.note.findFirst({
        where: { ...activeByUser(userId), slug },
      });
    },

    update(userId: string, id: string, input: UpdateNoteInput) {
      return db.note.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input as Record<string, unknown>),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.note.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },

    search(userId: string, query: string) {
      return db.$queryRaw(Prisma.sql`
        SELECT *
        FROM notes
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${query})
        ORDER BY updated_at DESC
      `);
    },
  };
}
