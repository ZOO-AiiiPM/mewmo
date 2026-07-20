import { getPrisma, type PrismaClient } from "@mewmo/db";
import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

interface ConfirmedCommand {
  actionId: string;
  idempotencyKey: string;
  expectedVersion?: number;
}

export function createKnowledgeService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async createBase(actor: Actor, input: ConfirmedCommand & { name: string }) {
      assertScope(actor.scopes, "knowledge:write");
      await assertConfirmed(db, actor, input);
      return db.knowledgeBase.create({ data: { userId: actor.userId, title: input.name } });
    },

    async renameBase(actor: Actor, input: ConfirmedCommand & { knowledgeBaseId: string; name: string }) {
      assertScope(actor.scopes, "knowledge:write");
      await assertConfirmed(db, actor, input);
      const result = await db.knowledgeBase.updateMany({
        where: { id: input.knowledgeBaseId, userId: actor.userId, deletedAt: null, ...(input.expectedVersion === undefined ? {} : { version: input.expectedVersion }) },
        data: { title: input.name, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new DomainError("conflict", "knowledge base was not found or changed");
      return db.knowledgeBase.findFirstOrThrow({ where: { id: input.knowledgeBaseId, userId: actor.userId } });
    },

    async addNote(actor: Actor, input: ConfirmedCommand & { noteId: string; knowledgeBaseId: string; folderId?: string | null }) {
      assertScope(actor.scopes, "knowledge:write");
      await assertConfirmed(db, actor, input);
      const [note, base, folder] = await Promise.all([
        db.note.findFirst({ where: { id: input.noteId, userId: actor.userId, deletedAt: null }, select: { version: true } }),
        db.knowledgeBase.findFirst({ where: { id: input.knowledgeBaseId, userId: actor.userId, deletedAt: null }, select: { id: true } }),
        input.folderId ? db.knowledgeFolder.findFirst({ where: { id: input.folderId, knowledgeBaseId: input.knowledgeBaseId, userId: actor.userId, deletedAt: null }, select: { id: true } }) : Promise.resolve(null),
      ]);
      if (!note || !base || (input.folderId && !folder)) throw new DomainError("not_found", "note, knowledge base, or folder was not found");
      if (input.expectedVersion !== undefined && note.version !== input.expectedVersion) throw new DomainError("conflict", "note version changed");
      const existing = await db.knowledgeItem.findFirst({ where: { userId: actor.userId, knowledgeBaseId: input.knowledgeBaseId, noteId: input.noteId, deletedAt: null } });
      if (existing) {
        return db.knowledgeItem.update({ where: { id: existing.id }, data: { folderId: input.folderId ?? null, version: { increment: 1 } } });
      }
      return db.knowledgeItem.create({ data: { userId: actor.userId, knowledgeBaseId: input.knowledgeBaseId, folderId: input.folderId ?? null, kind: "note", noteId: input.noteId } });
    },

    async moveItem(actor: Actor, input: ConfirmedCommand & { itemId: string; targetFolderId: string | null }) {
      assertScope(actor.scopes, "knowledge:write");
      await assertConfirmed(db, actor, input);
      const item = await db.knowledgeItem.findFirst({ where: { id: input.itemId, userId: actor.userId, deletedAt: null } });
      if (!item) throw new DomainError("not_found", "knowledge item was not found");
      if (input.expectedVersion !== undefined && item.version !== input.expectedVersion) throw new DomainError("conflict", "knowledge item version changed");
      if (input.targetFolderId) {
        const folder = await db.knowledgeFolder.findFirst({ where: { id: input.targetFolderId, knowledgeBaseId: item.knowledgeBaseId, userId: actor.userId, deletedAt: null } });
        if (!folder) throw new DomainError("not_found", "target folder was not found");
      }
      return db.knowledgeItem.update({ where: { id: item.id }, data: { folderId: input.targetFolderId, version: { increment: 1 } } });
    },

    async removeItem(actor: Actor, input: ConfirmedCommand & { itemId: string }) {
      assertScope(actor.scopes, "knowledge:write");
      await assertConfirmed(db, actor, input);
      const result = await db.knowledgeItem.updateMany({
        where: { id: input.itemId, userId: actor.userId, deletedAt: null, ...(input.expectedVersion === undefined ? {} : { version: input.expectedVersion }) },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1) throw new DomainError("conflict", "knowledge item was not found or changed");
      return { itemId: input.itemId, removed: true };
    },
  };
}

async function assertConfirmed(db: PrismaClient, actor: Actor, input: ConfirmedCommand) {
  if (actor.source !== "internal-agent" && actor.source !== "mcp") return;
  const action = await db.aiAction.findFirst({
    where: { id: input.actionId, userId: actor.userId, idempotencyKey: input.idempotencyKey, status: { in: ["confirmed", "executing"] } },
    select: { expectedVersion: true },
  });
  if (!action) throw new DomainError("confirmation_required", "Agent action is not confirmed");
  if (input.expectedVersion !== undefined && action.expectedVersion !== input.expectedVersion) throw new DomainError("conflict", "confirmed action version does not match command");
}
