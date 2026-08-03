import { describe, expect, it, vi } from "vitest";

import { createAiChatsRepository } from "./ai-chats";

function createClient(count: number) {
  const transaction = {
    aiChat: { updateMany: vi.fn().mockResolvedValue({ count }) },
    aiMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    aiSessionEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    aiTurn: { findFirst: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
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

  it("projects only safe ordered turn history and hides low reasoning", async () => {
    const client = {
      aiChat: {
        findFirst: vi.fn().mockResolvedValue({
          id: "chat-1",
          sessionEntries: [
            { entryId: "user-high", entrySeq: 1, timestamp: new Date("2026-08-03T00:00:00Z"), payload: { message: { role: "user", content: [{ type: "text", text: "高档问题" }] } }, attachments: [] },
            { entryId: "assistant-intermediate", entrySeq: 2, timestamp: new Date("2026-08-03T00:00:01Z"), payload: { message: { role: "assistant", content: [{ type: "text", text: "不应成为独立回复" }] } }, attachments: [] },
            { entryId: "assistant-high", entrySeq: 3, timestamp: new Date("2026-08-03T00:00:02Z"), payload: { message: { role: "assistant", content: [{ type: "text", text: "最终答案" }] } }, attachments: [] },
            { entryId: "user-low", entrySeq: 4, timestamp: new Date("2026-08-03T00:00:03Z"), payload: { message: { role: "user", content: [{ type: "text", text: "低档问题" }] } }, attachments: [] },
            { entryId: "assistant-low", entrySeq: 5, timestamp: new Date("2026-08-03T00:00:04Z"), payload: { message: { role: "assistant", content: [{ type: "text", text: "直接答案" }] } }, attachments: [] },
          ],
          turns: [
            {
              id: "turn-high", userEntryId: "user-high", assistantEntryId: "assistant-high", status: "succeeded",
              startedAt: new Date("2026-08-03T00:00:00Z"), completedAt: new Date("2026-08-03T00:00:02Z"),
              output: { transcript: { thinking: true, blocks: [
                { kind: "thinking", content: "真实推理", private: "raw-secret" },
                { kind: "tool", toolCallId: "tool-1", toolName: "content_search", status: "done", details: ["查询：Agent", "结果：找到 1 项"], args: { token: "raw-secret" } },
                { kind: "text", content: "最终答案" },
              ] }, response: {} },
            },
            {
              id: "turn-low", userEntryId: "user-low", assistantEntryId: "assistant-low", status: "succeeded",
              startedAt: new Date("2026-08-03T00:00:03Z"), completedAt: new Date("2026-08-03T00:00:04Z"),
              output: { transcript: { thinking: false, blocks: [{ kind: "thinking", content: "不得返回" }, { kind: "text", content: "直接答案" }] }, response: {} },
            },
          ],
          messages: [],
        }),
      },
    };

    const chat = await createAiChatsRepository(client).findById("user-1", "chat-1") as { messages: Array<{ metadata?: { process?: Array<{ kind: string; details?: string[] }> } }> };
    expect(chat.messages).toHaveLength(4);
    expect(chat.messages[1]?.metadata?.process?.map((block) => block.kind)).toEqual(["thinking", "tool", "text"]);
    expect(chat.messages[1]?.metadata?.process?.[1]?.details).toEqual(["查询：Agent", "结果：找到 1 项"]);
    expect(chat.messages[3]?.metadata?.process?.map((block) => block.kind)).toEqual(["text"]);
    expect(JSON.stringify(chat)).not.toContain("raw-secret");
    expect(JSON.stringify(chat)).not.toContain("不得返回");
  });
});

describe("ai chats repository truncate", () => {
  it("atomically deletes the entry-sequence suffix and rolls the active leaf back", async () => {
    const { client, transaction } = createClient(1);
    transaction.aiTurn.findFirst.mockResolvedValue({ userEntryId: "entry-user-2" });
    transaction.aiSessionEntry.findFirst
      .mockResolvedValueOnce({ entrySeq: 4 })
      .mockResolvedValueOnce({ entryId: "entry-assistant-1", type: "assistant", payload: {} });
    transaction.aiSessionEntry.findMany.mockResolvedValue([
      { entryId: "entry-user-2" },
      { entryId: "entry-assistant-2" },
    ]);

    await expect(createAiChatsRepository(client).truncateFromTurn("user-1", "chat-1", "turn-2"))
      .resolves.toEqual({ count: 1 });

    expect(transaction.aiTurn.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "turn-2", chatId: "chat-1", userId: "user-1" },
    }));
    expect(transaction.aiSessionEntry.deleteMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1", entrySeq: { gte: 4 } },
    });
    expect(transaction.aiTurn.deleteMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1", userId: "user-1", userEntryId: { in: ["entry-user-2", "entry-assistant-2"] } },
    });
    expect(transaction.aiChat.updateMany).toHaveBeenLastCalledWith({
      where: { id: "chat-1" },
      data: { activeLeafId: "entry-assistant-1" },
    });
  });

  it("rolls a surviving leaf entry back to its target", async () => {
    const { client, transaction } = createClient(1);
    transaction.aiTurn.findFirst.mockResolvedValue({ userEntryId: "entry-user-2" });
    transaction.aiSessionEntry.findFirst
      .mockResolvedValueOnce({ entrySeq: 4 })
      .mockResolvedValueOnce({ entryId: "leaf-1", type: "leaf", payload: { targetId: "entry-assistant-1" } });

    await createAiChatsRepository(client).truncateFromTurn("user-1", "chat-1", "turn-2");

    expect(transaction.aiChat.updateMany).toHaveBeenLastCalledWith({
      where: { id: "chat-1" },
      data: { activeLeafId: "entry-assistant-1" },
    });
  });

  it("does not mutate when the target turn is missing or not owned", async () => {
    const { client, transaction } = createClient(1);
    transaction.aiTurn.findFirst.mockResolvedValue(null);

    await expect(createAiChatsRepository(client).truncateFromTurn("user-1", "chat-1", "missing"))
      .resolves.toEqual({ count: 0 });
    expect(transaction.aiChat.updateMany).not.toHaveBeenCalled();
    expect(transaction.aiSessionEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("does not delete a suffix when chat ownership validation fails", async () => {
    const { client, transaction } = createClient(0);
    transaction.aiTurn.findFirst.mockResolvedValue({ userEntryId: "entry-user-2" });
    transaction.aiSessionEntry.findFirst.mockResolvedValue({ entrySeq: 4 });

    await expect(createAiChatsRepository(client).truncateFromTurn("user-1", "chat-1", "turn-2"))
      .resolves.toEqual({ count: 0 });
    expect(transaction.aiSessionEntry.findMany).not.toHaveBeenCalled();
    expect(transaction.aiSessionEntry.deleteMany).not.toHaveBeenCalled();
  });
});
