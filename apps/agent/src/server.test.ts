import { describe, expect, it, vi } from "vitest";

import type { AgentConfig } from "./config";
import { signIdentityForTest } from "./identity";
import { actionResultMessage, buildAgentServer } from "./server";
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
  JINA_API_KEY: "",
  AGENT_WEB_TIMEOUT_MS: 20_000,
  AGENT_WEB_SEARCH_BUDGET: 2,
  AGENT_WEB_FETCH_BUDGET: 5,
  AGENT_WEB_CACHE_TTL_MS: 300_000,
  AGENT_WEB_CACHE_MAX_ENTRIES: 128,
};

describe("Agent HTTP server", () => {
  it("does not allow unauthenticated Agent requests", async () => {
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application: createApplicationStub() });
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/messages", payload: validMessage() });
    expect(response.statusCode).toBe(401);
  });

  it("derives actor identity from the signed token and completes a leased turn", async () => {
    const run = vi.fn(async () => ({ text: "ok", proposals: [], citations: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" }));
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

  it("passes Deep Thinking and Deep Insight independently to the runtime", async () => {
    const run = vi.fn(async () => ({ text: "ok", proposals: [], citations: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" }));
    const app = buildAgentServer({ config, runtime: { run }, application: createApplicationStub() });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({
      method: "POST",
      url: "/v1/chats/chat-1/messages",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...validMessage(), thinking: true, skillId: "deep-insight" },
    });

    expect(response.statusCode).toBe(200);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ thinking: true, skillId: "deep-insight" }),
    }));
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

  it("streams a cached idempotent turn through the same stable completion contract", async () => {
    const run = vi.fn();
    const cached = completedResponse("cached");
    const application = createApplicationStub({ turns: { ...createApplicationStub().turns, begin: vi.fn(async () => ({ turnId: "turn-cached", cached })) } });
    const app = buildAgentServer({ config, runtime: { run }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/stream", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });

    expect(run).not.toHaveBeenCalled();
    expect(stableEvents(response.body)).toEqual([
      expect.objectContaining({ type: "turn.started", turnId: "turn-cached", seq: 1 }),
      expect.objectContaining({ type: "turn.completed", turnId: "turn-cached", seq: 2, message: expect.objectContaining({ content: "cached" }) }),
    ]);
  });

  it("streams Pi lifecycle events and a final response over SSE", async () => {
    const runtime = { run: vi.fn(async (_context, onEvent) => {
      await onEvent?.({ type: "text_delta", delta: "ok" });
      await onEvent?.({ type: "thinking_delta", delta: "private reasoning" });
      return { text: "ok", proposals: [], citations: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" };
    }) };
    const app = buildAgentServer({ config, runtime, application: createApplicationStub() });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/stream", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: turn.started");
    expect(response.body).toContain("event: assistant.text.delta");
    expect(response.body).toContain("event: turn.completed");
    expect(response.body).toContain("event: text_delta");
    expect(response.body).toContain("event: result");
    expect(response.body).not.toContain("private reasoning");
    expect(stableEvents(response.body).map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it("streams product tool and confirmation events without raw tool payloads", async () => {
    const proposal = {
      id: "action-1",
      toolName: "note_update" as const,
      preview: { title: "更新当前笔记", summary: "修改标题" },
      riskLevel: "medium" as const,
      status: "proposed" as const,
      executionMode: "server" as const,
    };
    const runtime = { run: vi.fn(async (_context, onEvent) => {
      await onEvent?.({ type: "tool_start", toolCallId: "tool-1", toolName: "read_current_context" });
      await onEvent?.({ type: "tool_end", toolCallId: "tool-1", toolName: "read_current_context", isError: false });
      return { text: "ok", proposals: [proposal], citations: [], userEntryId: "entry-user", assistantEntryId: "entry-assistant" };
    }) };
    const complete = vi.fn(async () => ({ ...completedResponse("ok"), proposals: [proposal] }));
    const application = createApplicationStub({ turns: { ...createApplicationStub().turns, complete } });
    const app = buildAgentServer({ config, runtime, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/stream", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });
    const events = stableEvents(response.body);

    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "tool.started",
      "tool.completed",
      "confirmation.required",
      "turn.completed",
    ]);
    expect(events[1]).toMatchObject({ tool: "read_current_context", display: { label: "正在读取当前内容" } });
    expect(events[2]).not.toHaveProperty("result");
    expect(events[3]).toMatchObject({ actionId: "action-1", display: { title: "更新当前笔记", riskLevel: "medium" } });
  });

  it("streams a stable failed event before the legacy error", async () => {
    const fail = vi.fn(async () => {});
    const app = buildAgentServer({
      config,
      runtime: { run: vi.fn(async () => { throw new Error("provider secret"); }) },
      application: createApplicationStub({ turns: { ...createApplicationStub().turns, fail } }),
    });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const response = await app.inject({ method: "POST", url: "/v1/chats/chat-1/stream", headers: { authorization: `Bearer ${token}` }, payload: validMessage() });
    const events = stableEvents(response.body);

    expect(events.map((event) => event.type)).toEqual(["turn.started", "turn.failed"]);
    expect(events[1]).toMatchObject({
      error: { code: "internal_error", message: "Agent request failed.", retryable: true },
      retryable: true,
    });
    expect(response.body).not.toContain("provider secret");
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      code: "internal_error",
      message: "Agent request failed.",
    }));
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

  it("returns a succeeded action with a resultMessage after confirm (A1 no throw + A2 result message)", async () => {
    const confirm = vi.fn(async ({ actionId }) => ({
      id: actionId,
      toolName: "knowledge_base_create" as const,
      preview: { title: "创建知识库", summary: "创建「阅读笔记」知识库" },
      riskLevel: "low" as const,
      status: "succeeded" as const,
      executionMode: "server" as const,
      result: { id: "kb-1" },
    }));
    const application = createApplicationStub({ actions: { ...createApplicationStub().actions, confirm } });
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const headers = { authorization: `Bearer ${token}` };
    const response = await app.inject({ method: "POST", url: "/v1/actions/action-1/confirm", headers, payload: { executionMode: "server" } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.action.status).toBe("succeeded");
    expect(body.resultMessage).toContain("已创建知识库");
    expect(body.resultMessage).toContain("创建知识库");
  });

  it("returns a failed action in 200 instead of throwing 409 (A1 session lock fix)", async () => {
    const confirm = vi.fn(async ({ actionId }) => ({
      id: actionId,
      toolName: "note_move_to_trash" as const,
      preview: { title: "移入废纸篓" },
      riskLevel: "high" as const,
      status: "failed" as const,
      executionMode: "server" as const,
      error: { code: "conflict", message: "note version changed", retryable: true },
    }));
    const application = createApplicationStub({ actions: { ...createApplicationStub().actions, confirm } });
    const app = buildAgentServer({ config, runtime: { run: vi.fn() }, application });
    const token = await signIdentityForTest(TEST_ACTOR, identityOptions());
    const headers = { authorization: `Bearer ${token}` };
    const response = await app.inject({ method: "POST", url: "/v1/actions/action-1/confirm", headers, payload: { executionMode: "server" } });
    // Should be 200 with the failed action, NOT 409
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.action.status).toBe("failed");
    expect(body.action.error.code).toBe("conflict");
    expect(body.action.error.retryable).toBe(true);
    // No resultMessage for failed actions
    expect(body.resultMessage).toBeUndefined();
  });
});

describe("actionResultMessage", () => {
  it("generates a confirmation message with tool label and preview title", () => {
    const message = actionResultMessage({
      id: "a1",
      toolName: "note_create",
      preview: { title: "创建笔记", summary: "新建「读书心得」笔记" },
      riskLevel: "low",
      status: "succeeded",
      executionMode: "server",
    });
    expect(message).toBe("已创建笔记「创建笔记」— 新建「读书心得」笔记");
  });

  it("falls back to a generic message when preview is empty", () => {
    const message = actionResultMessage({
      id: "a2",
      toolName: "knowledge_item_remove",
      preview: {},
      riskLevel: "medium",
      status: "succeeded",
      executionMode: "server",
    });
    expect(message).toBe("已移除知识条目");
  });
});

function validMessage() { return { clientRequestId: "request-1", content: "hello", context: null }; }
function identityOptions() { return { secret: config.AGENT_IDENTITY_SECRET, issuer: config.AGENT_IDENTITY_ISSUER, audience: config.AGENT_IDENTITY_AUDIENCE }; }
function completedResponse(content: string) { return { userMessage: { id: "entry-user", role: "user" as const, content: "hello", status: "completed", createdAt: "2026-07-20T00:00:00.000Z" }, assistantMessage: { id: "entry-assistant", role: "assistant" as const, content, status: "completed", createdAt: "2026-07-20T00:00:01.000Z" } }; }

function stableEvents(body: string) {
  return body
    .split("\n\n")
    .filter((chunk) => /^event: (turn\.|assistant\.|tool\.|confirmation\.)/m.test(chunk))
    .map((chunk) => JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? "null") as Record<string, unknown>);
}
