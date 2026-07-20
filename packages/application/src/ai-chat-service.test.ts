import { describe, expect, it, vi } from "vitest";
import { createActor } from "./actor";
import { createAiChatService } from "./ai-chat-service";

const actor = createActor({ userId: "user-1", source: "internal-agent", clientId: "session-1", scopes: ["content:read"] });

describe("AI chat application service", () => {
  it("loads only owned history and idempotently creates the user turn", async () => {
    const userMessage = message("user-message", "user", "current", "request-2", 2);
    const db = {
      aiChat: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      aiMessage: {
        upsert: vi.fn().mockResolvedValue(userMessage),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          userMessage,
          message("assistant-message", "assistant", "earlier answer", "request-1", 1),
          message("earlier-user", "user", "earlier", "request-1", 0),
        ]),
      },
    };
    const turn = await createAiChatService({ prisma: db as never }).prepareTurn(actor, {
      chatId: "chat-1", clientRequestId: "request-2", content: "current",
    });
    expect(db.aiChat.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) }));
    expect(turn.history).toEqual([
      { role: "user", content: "earlier" },
      { role: "assistant", content: "earlier answer" },
    ]);
    expect(turn.cachedAssistant).toBeNull();
  });

  it("rejects reuse of a request id with different content", async () => {
    const db = {
      aiChat: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      aiMessage: { upsert: vi.fn().mockResolvedValue(message("user-message", "user", "old", "request-1", 1)) },
    };
    await expect(createAiChatService({ prisma: db as never }).prepareTurn(actor, {
      chatId: "chat-1", clientRequestId: "request-1", content: "new",
    })).rejects.toMatchObject({ code: "conflict" });
  });
});

function message(id: string, role: "user" | "assistant", content: string, clientRequestId: string, seconds: number) {
  return {
    id,
    chatId: "chat-1",
    clientRequestId,
    role,
    content,
    status: "completed",
    metadata: null,
    version: 1,
    createdAt: new Date(`2026-07-20T00:00:0${seconds}.000Z`),
    deletedAt: null,
  };
}
