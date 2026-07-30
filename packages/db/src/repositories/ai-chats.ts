import { getPrisma } from "../client";
import { visibleAgentUserContent } from "@mewmo/shared";
import { activeByUser, softDeleteData, versionedUpdateData } from "./repository-utils";

const DEFAULT_CHAT_KEY = "sidebar";

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
  $transaction<T>(callback: (transaction: AiChatsClient) => Promise<T>): Promise<T>;
  aiChat: {
    create(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  aiMessage: {
    create(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  aiSessionEntry: {
    deleteMany(args: unknown): Promise<unknown>;
  };
  aiTurn: {
    deleteMany(args: unknown): Promise<unknown>;
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
    select: { id: true, userEntryId: true, assistantEntryId: true, status: true, errorMessage: true, output: true },
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
      const upsert = () => db.aiChat.upsert({
        where: { userId_defaultKey: { userId, defaultKey: DEFAULT_CHAT_KEY } },
        create: { title, userId, defaultKey: DEFAULT_CHAT_KEY },
        update: { title, deletedAt: null },
        include: chatMessageInclude,
      });
      try {
        return projectSessionMessages(await upsert());
      } catch (error) {
        // With `include`, Prisma upsert is select-then-create, so two first-touch
        // requests can race; the loser retries onto the update path.
        if (!isUniqueViolation(error)) throw error;
        return projectSessionMessages(await upsert());
      }
    },

    async findByUserId(userId: string) {
      return db.aiChat.findMany({
        where: activeByUser(userId),
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          // Message presence lives in two places: session entries (current
          // runtime) and legacy aiMessage rows. Count both so callers can
          // tell an empty chat apart without loading transcripts.
          _count: {
            select: {
              sessionEntries: { where: { type: "message" } },
              messages: { where: { deletedAt: null } },
            },
          },
        },
      });
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

    clearMessages(userId: string, chatId: string) {
      return db.$transaction(async (transaction) => {
        const owned = await transaction.aiChat.updateMany({
          where: { id: chatId, ...activeByUser(userId) },
          data: {
            activeLeafId: null,
            nextEntrySeq: 1,
            version: { increment: 1 },
          },
        }) as { count?: number };
        if (!owned.count) return owned;

        await transaction.aiMessage.deleteMany({ where: { chatId } });
        await transaction.aiSessionEntry.deleteMany({ where: { chatId } });
        await transaction.aiTurn.deleteMany({ where: { chatId, userId } });
        return owned;
      });
    },
  };
}

function projectSessionMessages(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { sessionEntries, turns, ...chat } = value;
  if (!Array.isArray(sessionEntries) || sessionEntries.length === 0) return chat;
  const turnMetadata = new Map<string, unknown>();
  const entryTurns = new Map<string, { turnId: string; status: string; error?: { message: string; retryable: boolean } }>();
  if (Array.isArray(turns)) {
    for (const turn of turns) {
      if (!isRecord(turn) || typeof turn.id !== "string" || typeof turn.status !== "string") continue;
      const failed = turn.status === "failed" || turn.status === "interrupted";
      const turnInfo = {
        turnId: turn.id,
        status: failed ? "failed" : "completed",
        ...(failed && typeof turn.errorMessage === "string" ? { error: { message: turn.errorMessage, retryable: true } } : {}),
      };
      if (typeof turn.userEntryId === "string") entryTurns.set(turn.userEntryId, turnInfo);
      if (typeof turn.assistantEntryId !== "string") continue;
      entryTurns.set(turn.assistantEntryId, turnInfo);
      if (!isRecord(turn.output) || !isRecord(turn.output.response)) continue;
      const response = turn.output.response;
      turnMetadata.set(turn.assistantEntryId, {
        ...(Array.isArray(response.proposals) ? { proposals: response.proposals } : {}),
        ...(isRecord(response.usage) ? { usage: response.usage } : {}),
      });
    }
  }
  const messages = sessionEntries.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.entryId !== "string" || !isRecord(entry.payload) || !isRecord(entry.payload.message)) return [];
    const message = entry.payload.message;
    if (message.role !== "user" && message.role !== "assistant") return [];
    const turn = entryTurns.get(entry.entryId);
    const content = messageText(message.content);
    if (message.role === "assistant" && content.trim().length === 0) return [];
    return [{
      id: entry.entryId,
      ...(turn ? { turnId: turn.turnId } : {}),
      role: message.role,
      content: message.role === "user" ? visibleAgentUserContent(content) : content,
      status: turn?.status ?? "completed",
      ...(turn?.error ? { error: turn.error } : {}),
      createdAt: entry.timestamp,
      metadata: turnMetadata.get(entry.entryId) ?? null,
      contextAttachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    }];
  });
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

function isUniqueViolation(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}
