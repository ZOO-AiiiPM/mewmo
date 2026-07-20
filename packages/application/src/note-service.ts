import { getPrisma, type Prisma, type PrismaClient } from "@mewmo/db";
import {
  noteCreateCommandSchema,
  noteUpdateCommandSchema,
  noteVersionCommandSchema,
  type NoteCreateCommandDto,
  type NoteUpdateCommandDto,
  type NoteVersionCommandDto,
} from "@mewmo/shared";
import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export function createNoteService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async create(actor: Actor, command: NoteCreateCommandDto) {
      assertScope(actor.scopes, "notes:write");
      const input = noteCreateCommandSchema.parse(command);
      await assertConfirmedAgentAction(db, actor, input.actionId, input.idempotencyKey);
      const slug = input.slug ?? slugify(input.title);
      try {
        return await db.$transaction(async (tx) => {
          const note = await tx.note.create({ data: { userId: actor.userId, title: input.title, content: input.content, slug } });
          await enqueueNoteEmbedding(tx, actor.userId, note.id, note.version);
          return note;
        });
      } catch (error) {
        if (isUniqueError(error)) throw new DomainError("already_exists", "note slug already exists");
        throw error;
      }
    },

    async update(actor: Actor, command: NoteUpdateCommandDto) {
      assertScope(actor.scopes, "notes:write");
      const input = noteUpdateCommandSchema.parse(command);
      await assertConfirmedAgentAction(db, actor, input.actionId, input.idempotencyKey, input.expectedVersion);
      const patch = {
        ...(input.patch.title === undefined ? {} : { title: input.patch.title }),
        ...(input.patch.content === undefined ? {} : { content: input.patch.content }),
        ...(input.patch.pinned === undefined ? {} : { pinned: input.patch.pinned }),
      };
      return db.$transaction(async (tx) => {
        const result = await tx.note.updateMany({
          where: { id: input.noteId, userId: actor.userId, deletedAt: null, version: input.expectedVersion },
          data: { ...patch, version: { increment: 1 } },
        });
        await assertMutationResult(tx, actor.userId, input.noteId, input.expectedVersion, result.count);
        const note = await tx.note.findFirstOrThrow({ where: { id: input.noteId, userId: actor.userId } });
        if (input.patch.title !== undefined || input.patch.content !== undefined) {
          await enqueueNoteEmbedding(tx, actor.userId, note.id, note.version);
        }
        return note;
      });
    },

    async moveToTrash(actor: Actor, command: NoteVersionCommandDto) {
      assertScope(actor.scopes, "trash:write");
      const input = noteVersionCommandSchema.parse(command);
      await assertConfirmedAgentAction(db, actor, input.actionId, input.idempotencyKey, input.expectedVersion);
      const result = await db.note.updateMany({
        where: { id: input.noteId, userId: actor.userId, deletedAt: null, version: input.expectedVersion },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await assertMutationResult(db, actor.userId, input.noteId, input.expectedVersion, result.count);
      return { noteId: input.noteId, trashed: true };
    },

    async restore(actor: Actor, command: NoteVersionCommandDto) {
      assertScope(actor.scopes, "trash:write");
      const input = noteVersionCommandSchema.parse(command);
      await assertConfirmedAgentAction(db, actor, input.actionId, input.idempotencyKey, input.expectedVersion);
      const result = await db.note.updateMany({
        where: { id: input.noteId, userId: actor.userId, deletedAt: { not: null }, version: input.expectedVersion },
        data: { deletedAt: null, version: { increment: 1 } },
      });
      await assertMutationResult(db, actor.userId, input.noteId, input.expectedVersion, result.count);
      return { noteId: input.noteId, restored: true };
    },
  };
}

async function assertMutationResult(db: Pick<PrismaClient, "note"> | Prisma.TransactionClient, userId: string, noteId: string, expectedVersion: number, count: number) {
  if (count === 1) return;
  const existing = await db.note.findFirst({ where: { id: noteId, userId }, select: { version: true } });
  if (!existing) throw new DomainError("not_found", "note was not found");
  throw new DomainError("conflict", "note version changed", { expectedVersion, actualVersion: existing.version });
}

function enqueueNoteEmbedding(
  db: Pick<PrismaClient, "aiRun"> | Prisma.TransactionClient,
  userId: string,
  noteId: string,
  inputVersion: number,
) {
  const idempotencyKey = `embedding:note:${noteId}:v${inputVersion}`;
  return db.aiRun.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    create: {
      userId,
      kind: "embedding",
      targetType: "note",
      targetId: noteId,
      inputVersion,
      idempotencyKey,
      priority: 10,
    },
    update: {},
  });
}

function slugify(value: string) {
  const base = value.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "");
  return base || `note-${Date.now()}`;
}

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function assertConfirmedAgentAction(
  db: PrismaClient,
  actor: Actor,
  actionId: string | undefined,
  idempotencyKey: string,
  expectedVersion?: number,
) {
  if (actor.source !== "internal-agent" && actor.source !== "mcp") return;
  if (!actionId) throw new DomainError("confirmation_required", "confirmed action is required for Agent writes");
  const action = await db.aiAction.findFirst({
    where: { id: actionId, userId: actor.userId, idempotencyKey, status: { in: ["confirmed", "executing"] } },
    select: { expectedVersion: true },
  });
  if (!action) throw new DomainError("confirmation_required", "Agent action is not confirmed");
  if (expectedVersion !== undefined && action.expectedVersion !== expectedVersion) {
    throw new DomainError("conflict", "confirmed action version does not match command");
  }
}
