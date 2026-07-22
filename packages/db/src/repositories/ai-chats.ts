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
  sessionEntries: {
    where: { type: "message" },
    orderBy: { entrySeq: "asc" },
    include: { attachments: true },
  },
  turns: {
    where: { status: "succeeded" },
    select: { assistantEntryId: true, output: true },
  },
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
      if (existing) return projectSessionMessages(existing);

      return projectSessionMessages(await db.aiChat.create({
        data: { title, userId },
        include: chatMessageInclude,
      }));
    },

    async findByUserId(userId: string) {
      const chats = await db.aiChat.findMany({
        where: activeByUser(userId),
        orderBy: { updatedAt: "desc" },
        include: chatMessageInclude,
      });
      return Array.isArray(chats) ? chats.map(projectSessionMessages) : chats;
    },

    async findById(userId: string, id: string) {
      const chat = await db.aiChat.findFirst({
        where: { id, ...activeByUser(userId) },
        include: chatMessageInclude,
      });
      return chat ? projectSessionMessages(chat) : null;
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

function projectSessionMessages(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.sessionEntries) || value.sessionEntries.length === 0) return value;
  const turnMetadata = new Map<string, unknown>();
  if (Array.isArray(value.turns)) {
    for (const turn of value.turns) {
      if (!isRecord(turn) || typeof turn.assistantEntryId !== "string" || !isRecord(turn.output) || !isRecord(turn.output.response)) continue;
      const response = turn.output.response;
      turnMetadata.set(turn.assistantEntryId, {
        ...(Array.isArray(response.proposals) ? { proposals: response.proposals } : {}),
        ...(isRecord(response.usage) ? { usage: response.usage } : {}),
      });
    }
  }
  const messages = value.sessionEntries.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.entryId !== "string" || !isRecord(entry.payload) || !isRecord(entry.payload.message)) return [];
    const message = entry.payload.message;
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{
      id: entry.entryId,
      role: message.role,
      content: messageText(message.content),
      status: "completed",
      createdAt: entry.timestamp,
      metadata: turnMetadata.get(entry.entryId) ?? null,
      contextAttachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    }];
  });
  const { sessionEntries: _sessionEntries, turns: _turns, ...chat } = value;
  return { ...chat, messages };
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(isRecord)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
