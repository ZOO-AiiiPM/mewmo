import { createHash } from "node:crypto";

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

  it("returns a succeeded duplicate as cached without creating another turn", async () => {
    const existing = { id: "turn-1", requestHash: hash("same content"), status: "succeeded", output: { response: {} } };
    const tx = {
      aiChat: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      aiTurn: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn() },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };

    await expect(createAiSessionService({ prisma: db as never }).beginTurn(actor, {
      chatId: "chat-1",
      clientRequestId: "request-1",
      content: "same content",
      workerId: "worker-2",
      leaseMs: 60_000,
    })).resolves.toEqual({ cached: true, turn: existing });
    expect(tx.aiTurn.create).not.toHaveBeenCalled();
  });

  it("does not replay an active or failed request id", async () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    const base = { id: "turn-1", requestHash: hash("same content") };
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ ...base, status: "running", leaseExpiresAt: new Date("2026-07-26T00:01:00.000Z") })
      .mockResolvedValueOnce({ ...base, status: "failed", leaseExpiresAt: null });
    const tx = {
      aiChat: { findFirst: vi.fn().mockResolvedValue({ id: "chat-1" }) },
      aiTurn: { findUnique, create: vi.fn(), update: vi.fn() },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    const service = createAiSessionService({ prisma: db as never });
    const input = {
      chatId: "chat-1",
      clientRequestId: "request-1",
      content: "same content",
      workerId: "worker-2",
      leaseMs: 60_000,
      now,
    };

    await expect(service.beginTurn(actor, input)).rejects.toMatchObject({ code: "conflict" });
    await expect(service.beginTurn(actor, input)).rejects.toMatchObject({ code: "invalid_state" });
    expect(tx.aiTurn.create).not.toHaveBeenCalled();
  });

  it("does not complete a turn with an intermediate tool-use assistant entry", async () => {
    const tx = {
      aiTurn: {
        findFirst: vi.fn().mockResolvedValue({
          id: "turn-1",
          chatId: "chat-1",
          userId: "user-1",
          status: "running",
          workerId: "worker-1",
          leaseExpiresAt: new Date("2026-07-26T00:02:00.000Z"),
        }),
        update: vi.fn(),
      },
      aiSessionEntry: {
        findFirst: vi.fn().mockResolvedValue({
          type: "message",
          payload: { message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall" }] } },
        }),
      },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };

    await expect(createAiSessionService({ prisma: db as never }).completeTurn(actor, {
      turnId: "turn-1",
      workerId: "worker-1",
      assistantEntryId: "assistant-tool",
      output: {},
      now: new Date("2026-07-26T00:01:00.000Z"),
    })).rejects.toMatchObject({ code: "invalid_state" });
    expect(tx.aiTurn.update).not.toHaveBeenCalled();
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

function hash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
