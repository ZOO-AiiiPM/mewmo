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
  AGENT_WORKER_ID: "test-worker",
  AGENT_TURN_LEASE_MS: 120_000,
};

describe("Agent HTTP server", () => {
  it("does not allow unauthenticated Agent requests", async () => {
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application: createApplicationStub() });
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/messages", payload: validMessage() });
    expect(response.statusCode).toBe(401);
  });

  it("derives actor identity from the signed token and completes a leased turn", async () => {
    const run = vi.fn(async () => ({ text: "ok", proposals: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" }));
    const complete = vi.fn(async () => completedResponse("ok"));
    const application = createApplicationStub({ turns: { ...createApplicationStub().turns, complete } });
    const app = buildAgentServer({ config, runtime: { run }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/messages", headers: { authorization: `Bearer ${token}` }, payload: { ...validMessage(), userId: "attacker" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(completedResponse("ok"));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ actor: TEST_ACTOR, turnId: "turn-1" }));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ assistantEntryId: "entry-assistant" }));
  });

  it("returns a cached idempotent turn without calling the model", async () => {
    const run = vi.fn();
    const cached = completedResponse("cached");
    const application = createApplicationStub({ turns: { ...createApplicationStub().turns, begin: vi.fn(async () => ({ turnId: "turn-1", cached })) } });
    const app = buildAgentServer({ config, runtime: { run }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/messages", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });
    expect(response.json()).toMatchObject({ assistantMessage: { content: "cached" } });
    expect(run).not.toHaveBeenCalled();
  });

  it("streams Pi lifecycle events and a final response over SSE", async () => {
    const runtime = { run: vi.fn(async (_context, onEvent) => { await onEvent?.({ type: "text_delta", delta: "ok" }); return { text: "ok", proposals: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" }; }) };
    const app = buildAgentServer({ config, runtime, application: createApplicationStub() });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/stream", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: text_delta");
    expect(response.body).toContain("event: result");
  });

  it("keeps a client edit confirmed until the Web reports its save result", async () => {
    const confirm = vi.fn(async ({ actionId, executionMode }) => ({ id: actionId, toolName: "note_update" as const, preview: { title: "Update note" }, riskLevel: "medium" as const, status: "confirmed" as const, executionMode, clientEffect: { kind: "note_draft_patch" as const, noteId: "note-1", content: "new", baseVersion: 3 } }));
    const reportResult = vi.fn(async ({ actionId, status }) => ({ id: actionId, toolName: "note_update" as const, preview: { title: "Update note" }, riskLevel: "medium" as const, status, executionMode: "client" as const }));
    const application = createApplicationStub({ actions: { ...createApplicationStub().actions, confirm, reportResult } });
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const headers = { authorization: `Bearer ${token}` };
    const confirmed = await app.inject({ method: "POST", url: "/v1/actions/action-1/confirm", headers, payload: { executionMode: "client" } });
    expect(confirmed.json()).toMatchObject({ action: { status: "confirmed", executionMode: "client" } });
    const completed = await app.inject({ method: "POST", url: "/v1/actions/action-1/result", headers, payload: { status: "succeeded", result: { version: 4 } } });
    expect(completed.json()).toMatchObject({ action: { id: "action-1", status: "succeeded" } });
  });
});

function validMessage() { return { clientRequestId: "request-1", content: "hello", context: null }; }
function identityOptions() { return { secret: config.AGENT_IDENTITY_SECRET, issuer: config.AGENT_IDENTITY_ISSUER, audience: config.AGENT_IDENTITY_AUDIENCE }; }
function completedResponse(content: string) { return { userMessage: { id: "entry-user", role: "user" as const, content: "hello", status: "completed", createdAt: "2026-07-20T00:00:00.000Z" }, assistantMessage: { id: "entry-assistant", role: "assistant" as const, content, status: "completed", createdAt: "2026-07-20T00:00:01.000Z" } }; }
