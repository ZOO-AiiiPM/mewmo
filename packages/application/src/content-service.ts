import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";
import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export type ContentType = "note" | "clip" | "feed_entry";

export interface SearchContentInput {
  query: string;
  types?: ContentType[];
  limit?: number;
}

export function createContentService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async get(actor: Actor, type: ContentType, id: string) {
      assertScope(actor.scopes, "content:read");
      const record = await findContent(db, actor.userId, type, id);
      if (!record) throw new DomainError("not_found", `${type} was not found`);
      return { ...record, type, resourceUri: `mewmo://${resourceCollection(type)}/${id}` };
    },

    async search(actor: Actor, input: SearchContentInput) {
      assertScope(actor.scopes, "content:read");
      const query = input.query.trim();
      if (!query) return [];
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
      const types = input.types?.length ? input.types : (["note", "clip", "feed_entry"] as const);
      const rows = await db.$queryRaw<Array<{
        type: ContentType;
        id: string;
        title: string;
        preview: string;
        version: number;
        updatedAt: Date;
      }>>(Prisma.sql`
        SELECT * FROM (
          SELECT 'note'::text AS type, id, title, left(content, 240) AS preview, version, updated_at AS "updatedAt"
          FROM notes WHERE user_id = ${actor.userId} AND deleted_at IS NULL
            AND ('note' = ANY(${types}::text[]))
            AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${query})
          UNION ALL
          SELECT 'clip'::text AS type, id, title, left(content, 240), version, updated_at
          FROM clips WHERE user_id = ${actor.userId} AND deleted_at IS NULL
            AND ('clip' = ANY(${types}::text[]))
            AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${query})
          UNION ALL
          SELECT 'feed_entry'::text AS type, id, title, left(content, 240), version, updated_at
          FROM feed_entries WHERE user_id = ${actor.userId} AND deleted_at IS NULL
            AND ('feed_entry' = ANY(${types}::text[]))
            AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', ${query})
        ) content
        ORDER BY "updatedAt" DESC
        LIMIT ${limit}
      `);
      return rows.map((row) => ({
        ...row,
        resourceUri: `mewmo://${resourceCollection(row.type)}/${row.id}`,
      }));
    },
  };
}

function findContent(db: PrismaClient, userId: string, type: ContentType, id: string) {
  const where = { id, userId, deletedAt: null };
  const select = { id: true, title: true, content: true, summary: true, version: true, updatedAt: true };
  if (type === "note") return db.note.findFirst({ where, select });
  if (type === "clip") return db.clip.findFirst({ where, select });
  return db.feedEntry.findFirst({ where, select });
}

function resourceCollection(type: ContentType) {
  if (type === "feed_entry") return "feed-entries";
  return `${type}s`;
}
