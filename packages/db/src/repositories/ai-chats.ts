import { getPrisma } from "../client";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

export interface CreateAiChatInput {
  title: string;
}

export interface CreateAiMessageInput {
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
  metadata?: Record<string, unknown> | null;
}

export interface UpdateAiMessageInput {
  content?: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
  metadata?: Record<string, unknown> | null;
}

export interface CreateAiContextAttachmentInput {
  targetType: "note" | "clip" | "feed_entry";
  targetId: string;
  title: string;
  sourceUrl?: string | null;
  summarySnapshot?: string | null;
  contentSnapshot?: string | null;
}

interface AiChatsClient {
  aiChat: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  aiMessage: {
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  aiContextAttachment: {
    create(args: unknown): Promise<unknown>;
  };
}

const chatMessageInclude = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { contextAttachments: true },
  },
};

export function createAiChatsRepository(client: unknown = getPrisma()) {
  const db = client as AiChatsClient;

  return {
    create(userId: string, input: CreateAiChatInput) {
      return db.aiChat.create({ data: { ...input, userId } });
    },

    async findOrCreateDefault(userId: string, title = "mewmo") {
      const existing = await db.aiChat.findFirst({
        where: { ...activeByUser(userId), title },
        include: chatMessageInclude,
      });
      if (existing) return existing;

      return db.aiChat.create({
        data: { title, userId },
        include: chatMessageInclude,
      });
    },

    findByUserId(userId: string) {
      return db.aiChat.findMany({
        where: activeByUser(userId),
        orderBy: { updatedAt: "desc" },
        include: chatMessageInclude,
      });
    },

    findById(userId: string, id: string) {
      return db.aiChat.findFirst({
        where: { id, ...activeByUser(userId) },
        include: chatMessageInclude,
      });
    },

    update(userId: string, id: string, input: Partial<CreateAiChatInput>) {
      return db.aiChat.updateMany({
        where: { id, ...activeByUser(userId) },
        data: versionedUpdateData(input),
      });
    },

    delete(userId: string, id: string, now = new Date()) {
      return db.aiChat.updateMany({
        where: { id, ...activeByUser(userId) },
        data: softDeleteData(now),
      });
    },

    addMessage(chatId: string, input: CreateAiMessageInput) {
      return db.aiMessage.create({ data: { status: "completed", ...input, chatId } });
    },

    updateMessage(chatId: string, messageId: string, input: UpdateAiMessageInput) {
      return db.aiMessage.updateMany({
        where: { id: messageId, chatId, deletedAt: null },
        data: { ...input, version: { increment: 1 } },
      });
    },

    addContextAttachment(userId: string, messageId: string, input: CreateAiContextAttachmentInput) {
      return db.aiContextAttachment.create({
        data: {
          userId,
          messageId,
          ...input,
        },
      });
    },
  };
}
