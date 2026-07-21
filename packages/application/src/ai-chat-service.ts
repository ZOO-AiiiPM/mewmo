import { getPrisma, type PrismaClient } from "@mewmo/db";
import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export interface PrepareAiChatTurnInput {
  chatId: string;
  clientRequestId: string;
  content: string;
}

export function createAiChatService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async prepareTurn(actor: Actor, input: PrepareAiChatTurnInput) {
      assertScope(actor.scopes, "content:read");
      await requireOwnedChat(db, actor.userId, input.chatId);
      const userMessage = await db.aiMessage.upsert({
        where: { chat_turn_role: { chatId: input.chatId, clientRequestId: input.clientRequestId, role: "user" } },
        create: {
          chatId: input.chatId,
          clientRequestId: input.clientRequestId,
          role: "user",
          content: input.content,
          status: "completed",
        },
        update: {},
      });
      if (userMessage.content !== input.content) {
        throw new DomainError("conflict", "clientRequestId was already used with different content");
      }

      const [messages, cachedAssistant] = await Promise.all([
        db.aiMessage.findMany({
          where: { chatId: input.chatId, deletedAt: null, status: "completed" },
          orderBy: { createdAt: "desc" },
          take: 60,
        }),
        db.aiMessage.findFirst({
          where: { chatId: input.chatId, clientRequestId: input.clientRequestId, role: "assistant", deletedAt: null, status: "completed" },
        }),
      ]);
      const history = messages.reverse()
        .filter((message) => message.clientRequestId !== input.clientRequestId)
        .filter((message): message is typeof message & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant")
        .map((message) => ({ role: message.role, content: message.content }));
      return { userMessage, history, cachedAssistant };
    },

    async completeTurn(actor: Actor, input: {
      chatId: string;
      clientRequestId: string;
      content: string;
      metadata?: Record<string, unknown>;
    }) {
      assertScope(actor.scopes, "content:read");
      return db.$transaction(async (tx) => {
        await requireOwnedChat(tx, actor.userId, input.chatId);
        const assistantMessage = await tx.aiMessage.upsert({
          where: { chat_turn_role: { chatId: input.chatId, clientRequestId: input.clientRequestId, role: "assistant" } },
          create: {
            chatId: input.chatId,
            clientRequestId: input.clientRequestId,
            role: "assistant",
            content: input.content,
            status: "completed",
            ...(input.metadata === undefined ? {} : { metadata: input.metadata as never }),
          },
          update: {},
        });
        if (assistantMessage.content !== input.content) {
          throw new DomainError("conflict", "Agent turn already completed with different content");
        }
        await tx.aiChat.updateMany({
          where: { id: input.chatId, userId: actor.userId, deletedAt: null },
          data: { version: { increment: 1 } },
        });
        return assistantMessage;
      });
    },
  };
}

async function requireOwnedChat(db: Pick<PrismaClient, "aiChat">, userId: string, chatId: string) {
  const chat = await db.aiChat.findFirst({ where: { id: chatId, userId, deletedAt: null }, select: { id: true } });
  if (!chat) throw new DomainError("not_found", "AI chat was not found");
  return chat;
}
