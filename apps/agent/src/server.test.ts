import { describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "./config";
import { signIdentityForTest } from "./identity";
import { buildAgentServer } from "./server";
import { TEST_ACTOR, createApplicationStub } from "./testing";

const config: AgentConfig = {
  AGENT_IDENTITY_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  AGENT_IDENTITY_ISSUER: "mewmo-web",
  AGENT_IDENTITY_AUDIENCE: "mewmo-agent",
  AGENT_HOST: "127.0.0.1",
  AGENT_PORT: 3101,
  AGENT_MAX_STEPS: 6,
  AGENT_TIMEOUT_MS: 45_000,
};

describe("Agent HTTP server", () => {
  it("does not allow unauthenticated Agent requests", async () => {
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application: createApplicationStub() });
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/messages", payload: validMessage() });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "unauthorized", retryable: false } });
  });

  it("derives actor identity from the signed token, not request input", async () => {
    const run = vi.fn(async () => ({ text: "ok", proposals: [] }));
    const app = buildAgentServer({ config, runtime: { run }, application: createApplicationStub() });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({
      method: "POST",
      url: "/v1/chats/chat-1/messages",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validMessage(), userId: "attacker" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userMessage: { id: "message-user-1", role: "user", content: "hello", status: "completed", createdAt: "2026-07-20T00:00:00.000Z" },
      assistantMessage: { id: "message-assistant-1", role: "assistant", content: "ok", status: "completed", createdAt: "2026-07-20T00:00:01.000Z" },
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ actor: TEST_ACTOR, history: [] }));
  });

  it("returns the persisted response for an idempotent retry without calling the model", async () => {
    const run = vi.fn();
    const application = createApplicationStub({
      chats: {
        prepareTurn: vi.fn(async () => ({
          history: [{ role: "user" as const, content: "earlier" }],
          userMessage: { id: "message-user-1", role: "user" as const, content: "hello", status: "completed", createdAt: "2026-07-20T00:00:00.000Z" },
          cached: {
            assistantMessage: { id: "message-assistant-1", role: "assistant" as const, content: "cached", status: "completed", createdAt: "2026-07-20T00:00:01.000Z" },
            usage: { inputTokens: 10, outputTokens: 2 },
          },
        })),
        completeTurn: vi.fn(),
      },
    });
    const app = buildAgentServer({ config, runtime: { run }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({
      method: "POST",
      url: "/v1/chats/chat-1/messages",
      headers: { authorization: `Bearer ${token}` },
      payload: validMessage(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ assistantMessage: { content: "cached" }, usage: { inputTokens: 10 } });
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps a client edit confirmed until the Web reports its save result", async () => {
    const confirm = vi.fn(async ({ actionId, executionMode }) => ({
      id: actionId,
      status: "confirmed" as const,
      executionMode,
      clientEffect: { kind: "note_draft_patch" as const, noteId: "note-1", content: "new", baseVersion: 3 },
    }));
    const reportResult = vi.fn(async ({ actionId, status }) => ({ id: actionId, status }));
    const application = createApplicationStub({
      actions: {
        propose: vi.fn(),
        confirm,
        cancel: vi.fn(),
        retry: vi.fn(),
        reportResult,
      },
    });
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const headers = { authorization: `Bearer ${token}` };
    const confirmed = await app.inject({ method: "POST", url: "/v1/actions/action-1/confirm", headers, payload: { executionMode: "client" } });
    expect(confirmed.json()).toMatchObject({ action: { status: "confirmed", executionMode: "client", clientEffect: { content: "new" } } });
    expect(reportResult).not.toHaveBeenCalled();
    const completed = await app.inject({ method: "POST", url: "/v1/actions/action-1/result", headers, payload: { status: "succeeded", result: { version: 4 } } });
    expect(completed.json()).toEqual({ id: "action-1", status: "succeeded" });
  });
});

function validMessage() {
  return { clientRequestId: "request-1", content: "hello", skill: "general", context: null };
}

function identityOptions() {
  return { secret: config.AGENT_IDENTITY_SECRET, issuer: config.AGENT_IDENTITY_ISSUER, audience: config.AGENT_IDENTITY_AUDIENCE };
}
