import { describe, expect, it, vi } from "vitest";

import { createActor } from "./actor";
import { createAiSessionService } from "./ai-session-service";

const actor = createActor({ userId: "user-1", source: "internal-agent", clientId: "test", scopes: ["content:read"] });

describe("AI session service", () => {
  it("rejects a duplicate client request id with different content", async () => {
    const tx = {
      aiChat: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      aiTurn: { findUnique: vi.fn().mockResolvedValue({ id: "turn-1", requestHash: "different", status: "succeeded" }) },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    await expect(createAiSessionService({ prisma: db as never }).beginTurn(actor, {
      chatId: "chat-1",
      clientRequestId: "request-1",
      content: "new content",
      workerId: "worker-1",
      leaseMs: 60_000,
    })).rejects.toMatchObject({ code: "conflict" });
  });

  it("allocates an ordered entry and records usage with an entry idempotency key", async () => {
    const entry = { id: "db-entry", chatId: "chat-1", entryId: "entry-7", entrySeq: 7, parentId: null, type: "message", payload: {}, timestamp: new Date() };
    const tx = {
      aiChat: {
        findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }),
        update: vi.fn().mockResolvedValueOnce({ nextEntrySeq: 8 }).mockResolvedValueOnce({}),
      },
      aiTurn: {
        findFirst: vi.fn().mockResolvedValue({ id: "turn-1", chatId: "chat-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      aiSessionEntry: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(entry) },
      aiUsageEvent: { upsert: vi.fn().mockResolvedValue({ id: "usage-1" }) },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    await expect(createAiSessionService({ prisma: db as never }).appendEntry(actor, {
      chatId: "chat-1",
      turnId: "turn-1",
      entryId: "entry-7",
      parentId: null,
      type: "message",
      timestamp: "2026-07-22T00:00:00.000Z",
      payload: { message: { role: "assistant", content: [{ type: "text", text: "done" }] } },
      usage: {
        purpose: "agent.chat",
        operation: "agent.response",
        provider: "openai",
        requestedModel: "gpt-test",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheWriteTokens: 0,
      },
    })).resolves.toEqual(entry);
    expect(tx.aiSessionEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entrySeq: 7 }) }));
    expect(tx.aiUsageEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_idempotencyKey: { userId: "user-1", idempotencyKey: "session:chat-1:entry:entry-7" } },
    }));
  });
});
