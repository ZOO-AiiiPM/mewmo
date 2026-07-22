import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";
import { createHash, randomUUID } from "node:crypto";

import type { Actor } from "./actor";
import { recordAiUsage, type RecordAiUsageInput } from "./ai-usage-service";
import { assertScope, DomainError } from "./errors";

export interface SessionEntryInput {
  chatId: string;
  turnId?: string;
  entryId: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  payload: unknown;
  usage?: Omit<RecordAiUsageInput, "userId" | "chatId" | "turnId" | "entryId" | "idempotencyKey">;
}

export interface BeginAiTurnInput {
  chatId: string;
  clientRequestId: string;
  content: string;
  workerId: string;
  leaseMs: number;
  now?: Date;
}

export function createAiSessionService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();

  async function appendEntry(actor: Actor, input: SessionEntryInput) {
    assertScope(actor.scopes, "content:read");
    return db.$transaction(async (tx) => {
      const chat = await requireOwnedChat(tx, actor.userId, input.chatId);
      if (input.parentId) {
        const parent = await tx.aiSessionEntry.findFirst({ where: { chatId: chat.id, entryId: input.parentId }, select: { id: true } });
        if (!parent) throw new DomainError("not_found", "Session entry parent was not found");
      }
      if (input.turnId) {
        const turn = await requireOwnedTurn(tx, actor.userId, input.turnId);
        if (turn.chatId !== chat.id) throw new DomainError("forbidden", "Turn does not belong to this chat");
      }
      const updatedChat = await tx.aiChat.update({ where: { id: chat.id }, data: { nextEntrySeq: { increment: 1 } } });
      const entry = await tx.aiSessionEntry.create({
        data: {
          chatId: chat.id,
          entryId: input.entryId,
          entrySeq: updatedChat.nextEntrySeq - 1,
          parentId: input.parentId,
          type: input.type,
          payload: jsonValue(input.payload),
          timestamp: new Date(input.timestamp),
        },
      });
      const nextLeafId = input.type === "leaf" ? leafTarget(input.payload) : input.entryId;
      await tx.aiChat.update({ where: { id: chat.id }, data: { activeLeafId: nextLeafId } });

      const role = messageRole(input.type, input.payload);
      if (input.turnId && role === "user") {
        await tx.aiTurn.updateMany({ where: { id: input.turnId, chatId: chat.id }, data: { userEntryId: input.entryId } });
      }
      if (input.turnId && role === "assistant") {
        await tx.aiTurn.updateMany({ where: { id: input.turnId, chatId: chat.id }, data: { assistantEntryId: input.entryId } });
      }
      if (input.usage) {
        await recordAiUsage(tx, {
          userId: actor.userId,
          chatId: chat.id,
          ...(input.turnId ? { turnId: input.turnId } : {}),
          entryId: input.entryId,
          ...input.usage,
          idempotencyKey: `session:${chat.id}:entry:${input.entryId}`,
        });
      }
      return entry;
    });
  }

  return {
    async beginTurn(actor: Actor, input: BeginAiTurnInput) {
      assertScope(actor.scopes, "content:read");
      const now = input.now ?? new Date();
      const requestHash = hash(input.content);
      const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
      return db.$transaction(async (tx) => {
        await requireOwnedChat(tx, actor.userId, input.chatId);
        const existing = await tx.aiTurn.findUnique({
          where: { chatId_clientRequestId: { chatId: input.chatId, clientRequestId: input.clientRequestId } },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new DomainError("conflict", "clientRequestId was already used with different content");
          }
          if (existing.status === "succeeded") return { cached: true as const, turn: existing };
          if (existing.status === "running" && existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
            throw new DomainError("conflict", "this chat is already processing the request");
          }
          if (existing.status === "running") {
            await tx.aiTurn.update({
              where: { id: existing.id },
              data: { status: "interrupted", completedAt: now, errorCode: "lease_expired", errorMessage: "Agent worker lease expired", workerId: null, leaseExpiresAt: null },
            });
          }
          // A request id is an at-most-once model invocation key. Retrying with
          // a new id preserves the failed branch without replaying write tools.
          throw new DomainError("invalid_state", "this request cannot be replayed; create a new clientRequestId to retry safely");
        }
        const turn = await tx.aiTurn.create({
          data: {
            chatId: input.chatId,
            userId: actor.userId,
            clientRequestId: input.clientRequestId,
            requestHash,
            status: "running",
            workerId: input.workerId,
            leaseExpiresAt,
            startedAt: now,
          },
        });
        return { cached: false as const, turn };
      });
    },

    async completeTurn(actor: Actor, input: {
      turnId: string;
      workerId: string;
      assistantEntryId: string;
      output: unknown;
      now?: Date;
    }) {
      assertScope(actor.scopes, "content:read");
      const now = input.now ?? new Date();
      return db.$transaction(async (tx) => {
        const turn = await requireOwnedTurn(tx, actor.userId, input.turnId);
        if (turn.status === "succeeded") return turn;
        if (turn.status !== "running" || turn.workerId !== input.workerId || (turn.leaseExpiresAt && turn.leaseExpiresAt <= now)) {
          throw new DomainError("invalid_state", "Agent turn is not owned by this worker");
        }
        const assistant = await tx.aiSessionEntry.findFirst({ where: { chatId: turn.chatId, entryId: input.assistantEntryId, type: "message" } });
        if (!assistant) throw new DomainError("invalid_state", "Assistant session entry was not found");
        return tx.aiTurn.update({
          where: { id: turn.id },
          data: {
            status: "succeeded",
            assistantEntryId: input.assistantEntryId,
            output: jsonValue(input.output),
            completedAt: now,
            workerId: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
      });
    },

    async failTurn(actor: Actor, input: {
      turnId: string;
      workerId: string;
      code: string;
      message: string;
      interrupted?: boolean;
      now?: Date;
    }) {
      assertScope(actor.scopes, "content:read");
      const now = input.now ?? new Date();
      const turn = await requireOwnedTurn(db, actor.userId, input.turnId);
      if (turn.status !== "running" || turn.workerId !== input.workerId) return turn;
      return db.aiTurn.update({
        where: { id: turn.id },
        data: {
          status: input.interrupted ? "interrupted" : "failed",
          completedAt: now,
          workerId: null,
          leaseExpiresAt: null,
          errorCode: input.code.slice(0, 100),
          errorMessage: input.message.slice(0, 2_000),
        },
      });
    },

    async getTurn(actor: Actor, input: { turnId: string }) {
      assertScope(actor.scopes, "content:read");
      return requireOwnedTurn(db, actor.userId, input.turnId);
    },

    async getSessionMetadata(actor: Actor, chatId: string) {
      assertScope(actor.scopes, "content:read");
      const chat = await requireOwnedChat(db, actor.userId, chatId);
      return { id: chat.id, createdAt: chat.createdAt.toISOString(), activeLeafId: chat.activeLeafId };
    },

    appendEntry,

    async getEntry(actor: Actor, input: { chatId: string; entryId: string }) {
      assertScope(actor.scopes, "content:read");
      await requireOwnedChat(db, actor.userId, input.chatId);
      return db.aiSessionEntry.findFirst({ where: { chatId: input.chatId, entryId: input.entryId } });
    },

    async getEntries(actor: Actor, input: { chatId: string; afterEntrySeq?: number; limit?: number; type?: string }) {
      assertScope(actor.scopes, "content:read");
      await requireOwnedChat(db, actor.userId, input.chatId);
      return db.aiSessionEntry.findMany({
        where: {
          chatId: input.chatId,
          ...(input.afterEntrySeq === undefined ? {} : { entrySeq: { gt: input.afterEntrySeq } }),
          ...(input.type === undefined ? {} : { type: input.type }),
        },
        orderBy: { entrySeq: "asc" },
        ...(input.limit === undefined ? {} : { take: Math.min(Math.max(input.limit, 1), 500) }),
      });
    },

    async setLeaf(actor: Actor, input: { chatId: string; entryId: string; parentId: string | null; targetId: string | null; turnId?: string; timestamp?: string }) {
      return appendEntry(actor, {
        chatId: input.chatId,
        ...(input.turnId ? { turnId: input.turnId } : {}),
        entryId: input.entryId,
        parentId: input.parentId,
        type: "leaf",
        timestamp: input.timestamp ?? new Date().toISOString(),
        payload: { targetId: input.targetId },
      });
    },

    createEntryId() {
      return randomUUID();
    },
  };
}

async function requireOwnedChat(db: Pick<PrismaClient, "aiChat"> | Prisma.TransactionClient, userId: string, chatId: string) {
  const chat = await db.aiChat.findFirst({ where: { id: chatId, userId, deletedAt: null } });
  if (!chat) throw new DomainError("not_found", "AI chat was not found");
  return chat;
}

async function requireOwnedTurn(db: Pick<PrismaClient, "aiTurn"> | Prisma.TransactionClient, userId: string, turnId: string) {
  const turn = await db.aiTurn.findFirst({ where: { id: turnId, userId } });
  if (!turn) throw new DomainError("not_found", "AI turn was not found");
  return turn;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function leafTarget(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "targetId" in payload) {
    const value = (payload as Record<string, unknown>).targetId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function messageRole(type: string, payload: unknown) {
  if (type !== "message" || typeof payload !== "object" || payload === null || !("message" in payload)) return undefined;
  const message = (payload as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return undefined;
  const role = (message as Record<string, unknown>).role;
  return role === "user" || role === "assistant" ? role : undefined;
}
