import { describe, expect, it, vi } from "vitest";

import { createAiChatsRepository } from "./ai-chats";

function createClient(count: number) {
  const transaction = {
    aiChat: { updateMany: vi.fn().mockResolvedValue({ count }) },
    aiMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    aiSessionEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    aiTurn: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const client = {
    $transaction: vi.fn(async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  return { client, transaction };
}

describe("ai chats repository clear", () => {
  it("checks ownership before atomically deleting every transcript source", async () => {
    const { client, transaction } = createClient(1);
    const result = await createAiChatsRepository(client).clearMessages("user-1", "chat-1");

    expect(result).toEqual({ count: 1 });
    expect(transaction.aiChat.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "chat-1", userId: "user-1", deletedAt: null },
    }));
    expect(transaction.aiMessage.deleteMany).toHaveBeenCalledWith({ where: { chatId: "chat-1" } });
    expect(transaction.aiSessionEntry.deleteMany).toHaveBeenCalledWith({ where: { chatId: "chat-1" } });
    expect(transaction.aiTurn.deleteMany).toHaveBeenCalledWith({ where: { chatId: "chat-1", userId: "user-1" } });
  });

  it("does not delete transcript rows when the chat is not owned", async () => {
    const { client, transaction } = createClient(0);
    await createAiChatsRepository(client).clearMessages("user-1", "chat-2");

    expect(transaction.aiMessage.deleteMany).not.toHaveBeenCalled();
    expect(transaction.aiSessionEntry.deleteMany).not.toHaveBeenCalled();
    expect(transaction.aiTurn.deleteMany).not.toHaveBeenCalled();
  });

  it("does not expose raw turns or session entries when a chat has no session history", async () => {
    const client = {
      aiChat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-1",
          title: "会话",
          sessionEntries: [],
          turns: [{ id: "turn-internal" }],
          messages: [],
        }),
      },
    };

    await expect(createAiChatsRepository(client).findById("user-1", "chat-1")).resolves.toEqual({
      id: "chat-1",
      title: "会话",
      messages: [],
    });
  });
});
