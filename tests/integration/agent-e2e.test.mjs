/**
 * Agent end-to-end integration test (ZOO-73 Integration work package).
 *
 * Drives the real Mewmo Agent Fastify server over HTTP against real PostgreSQL
 * (packages/application + packages/db) with a deterministic fake AI provider.
 * It exercises the acceptance contract from the ZOO-63 Spec section 14:
 *
 *   - Auth boundary:  /health is public; Agent routes require a valid identity.
 *   - Turn idempotency: duplicate clientRequestId returns the cached response
 *     without a second model call or a duplicate AiUsageEvent.
 *   - Leased turn lifecycle: a running turn with a live lease rejects a second
 *     drive of the same requestId (at-most-once invocation).
 *   - SSE protocol: /stream emits a stable event sequence (turn.started ->
 *     assistant.text.delta -> turn.completed) with chatId/turnId/monotonic seq,
 *     and turn.completed carries the authoritative message projection.
 *   - Failure + recovery: a retryable provider failure persists turn.failed and
 *     a fresh clientRequestId retry recovers.
 *   - Usage: AiUsageEvent rows are written to PostgreSQL idempotently.
 *
 * It talks directly to the Agent server (the Web BFF is a thin authenticated
 * proxy covered separately by unit tests). Run as part of `pnpm test:integration`.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { createFakeAIRuntime } from "../../packages/ai/src/index.ts";
import { loadFoundationAdapters } from "../../apps/agent/src/adapters.ts";
import { signIdentityForTest } from "../../apps/agent/src/identity.ts";
import { createAgentRuntime } from "../../apps/agent/src/pi/runtime.ts";
import { buildAgentServer } from "../../apps/agent/src/server.ts";
import { createAiChatsRepository } from "../../packages/db/src/repositories/ai-chats.ts";
import { getPrisma } from "../../packages/db/src/client.ts";

import { API_TEST_EMAIL } from "./api-test-env.mjs";

const AGENT_PORT = Number(process.env.AGENT_E2E_PORT ?? "3121");
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;
const IDENTITY_SECRET = "integration-agent-identity-secret-0123456789";
// Deterministic provider responses. The faux Pi provider serves scripted
// responses one-per-model-call, and a single turn can issue several provider
// calls, so we seed a large identical batch to avoid queue exhaustion.
const ANSWER = "Integration E2E assistant answer";
const ANSWERS = Array(40).fill(ANSWER);
const FAILING_AI = () => createFakeAIRuntime({ agentResponses: [] }); // empty queue => retryable provider failure
const TEST_ACTOR_OID = (userId) => ({
  userId,
  source: "internal-agent",
  clientId: "e2e-test-client",
  scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
});

let app;
let db;
let userId;
let chatId;
let makeAuthToken;

async function startAgentServer(overrides = {}) {
  if (app) {
    await app.close().catch(() => {});
    app = null;
  }
  const foundations = await loadFoundationAdapters();
  const config = {
    AGENT_IDENTITY_SECRET: IDENTITY_SECRET,
    AGENT_IDENTITY_ISSUER: "mewmo-web",
    AGENT_IDENTITY_AUDIENCE: "mewmo-agent",
    AGENT_HOST: "127.0.0.1",
    AGENT_PORT,
    AGENT_MAX_STEPS: 6,
    AGENT_TIMEOUT_MS: 20_000,
    AGENT_WORKER_ID: "integration-worker",
    AGENT_CHAT_THINKING_LEVEL: "off",
    AGENT_TURN_LEASE_MS: 120_000,
    JINA_API_KEY: "",
    AGENT_WEB_TIMEOUT_MS: 5_000,
    AGENT_WEB_SEARCH_BUDGET: 0,
    AGENT_WEB_FETCH_BUDGET: 0,
    AGENT_WEB_CACHE_TTL_MS: 300_000,
    AGENT_WEB_CACHE_MAX_ENTRIES: 128,
    ...overrides.config,
  };
  const runtime = createAgentRuntime({
    ai: overrides.ai ?? createFakeAIRuntime({ agentResponses: [...ANSWERS] }),
    application: foundations.application,
    maxSteps: config.AGENT_MAX_STEPS,
    timeoutMs: config.AGENT_TIMEOUT_MS,
  });
  app = buildAgentServer({ config, runtime, application: foundations.application });
  await app.listen({ host: "127.0.0.1", port: AGENT_PORT });
}

async function setupUserAndChat() {
  const user = await db.user.findUnique({ where: { email: API_TEST_EMAIL } });
  assert.ok(user, `integration user ${API_TEST_EMAIL} must exist`);
  userId = user.id;
  const chat = await createAiChatsRepository().findOrCreateDefault(userId);
  chatId = chat.id;
  makeAuthToken = async () => signIdentityForTest(TEST_ACTOR_OID(userId), {
    secret: IDENTITY_SECRET,
    issuer: "mewmo-web",
    audience: "mewmo-agent",
  });
}

function agentJson(path, init = {}) {
  return fetch(`${AGENT_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

async function postMessage(chat, body, { auth = true } = {}) {
  return agentJson(`/v1/chats/${encodeURIComponent(chat)}/messages`, {
    method: "POST",
    headers: auth ? { authorization: `Bearer ${await makeAuthToken()}` } : {},
    body: JSON.stringify(body),
  });
}

async function readSse(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${AGENT_BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...init.headers,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    const events = [];
    for (const raw of text.split("\n\n")) {
      if (!raw.trim()) continue;
      let type = null;
      let data = null;
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) type = line.slice("event: ".length);
        else if (line.startsWith("data: ")) data = line.slice("data: ".length);
      }
      events.push({ event: type, data: data ? JSON.parse(data) : null });
    }
    return { status: res.status, events };
  } finally {
    clearTimeout(timer);
  }
}

test("Agent E2E: health, auth, idempotency, SSE, failure/recovery, usage", async (t) => {
  db = getPrisma();
  await startAgentServer();
  try {
    await setupUserAndChat();

    await t.test("GET /health is public", async () => {
      const res = await fetch(`${AGENT_BASE}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });

    await t.test("agent routes reject unauthenticated requests", async () => {
      const res = await postMessage(chatId, { clientRequestId: randomUUID(), content: "hi" }, { auth: false });
      assert.equal(res.status, 401);
    });

    await t.test("POST /messages completes a leased turn and persists Usage", async () => {
      const clientRequestId = randomUUID();
      const res = await postMessage(chatId, { clientRequestId, content: "hello, what do you see?" });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.userMessage.content, "hello, what do you see?");
      assert.equal(body.assistantMessage.content, ANSWER);
      assert.equal(body.assistantMessage.role, "assistant");

      // A completed lease persists an AiTurn row and an AiUsageEvent row.
      const turn = await db.aiTurn.findUnique({
        where: { chatId_clientRequestId: { chatId, clientRequestId } },
      });
      assert.ok(turn, "AiTurn should be persisted for the completed request");
      assert.equal(turn.status, "succeeded");

      const usage = await db.aiUsageEvent.findMany({
        where: { chatId, turnId: turn.id },
      });
      assert.ok(usage.length > 0, "AiUsageEvent should be recorded");
    });

    await t.test("duplicate clientRequestId returns cached response without a second model call", async () => {
      const clientRequestId = randomUUID();
      const first = await postMessage(chatId, { clientRequestId, content: "idempotent turn" });
      assert.equal(first.status, 200);
      const firstBody = await first.json();

      // Second drive of the same requestId + same content short-circuits to the
      // cached persisted output (beginTurn returns cached) and does not invoke
      // the model again => identical message projection and no duplicate Usage.
      const second = await postMessage(chatId, { clientRequestId, content: "idempotent turn" });
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.equal(secondBody.assistantMessage.id, firstBody.assistantMessage.id);
      assert.equal(secondBody.assistantMessage.content, firstBody.assistantMessage.content);

      const turn = await db.aiTurn.findUnique({
        where: { chatId_clientRequestId: { chatId, clientRequestId } },
      });
      const usage = await db.aiUsageEvent.findMany({ where: { chatId, turnId: turn.id } });
      assert.equal(usage.length, 1, "duplicate drive must not duplicate AiUsageEvent");
    });

    await t.test("a live leased turn rejects a mid-flight duplicate requestId", async () => {
      // beginTurn is an at-most-once guard: a second drive of a clientRequestId
      // that is still "running" with a live lease must reject as a conflict
      // instead of invoking the model a second time.
      const clientRequestId = `running-${randomUUID()}`;
      const content = "slow turn";
      // requestHash mirrors packages/application/src/ai-session-service.ts.
      const requestHash = createHash("sha256").update(content).digest("hex");
      const running = await db.aiTurn.create({
        data: {
          chatId,
          userId,
          clientRequestId,
          requestHash,
          status: "running",
          workerId: "slow-worker",
          leaseExpiresAt: new Date(Date.now() + 120_000),
        },
      });
      try {
        const res = await postMessage(chatId, { clientRequestId, content });
        assert.equal(res.status, 409, "a live leased turn must reject a second drive");
        const body = await res.json();
        assert.ok(body.error, "conflict response should carry an error payload");
      } finally {
        await db.aiTurn.delete({ where: { id: running.id } }).catch(() => {});
      }
    });

    await t.test("SSE /stream emits a stable conversation event sequence", async () => {
      const clientRequestId = randomUUID();
      const { status, events } = await readSse(
        `/v1/chats/${encodeURIComponent(chatId)}/stream`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${await makeAuthToken()}` },
          body: JSON.stringify({ clientRequestId, content: "stream this turn", context: null }),
        },
      );
      assert.equal(status, 200);

      const names = events.map((entry) => entry.event);
      assert.ok(names.includes("turn.started"), `expected turn.started in [${names}]`);
      assert.ok(names.includes("turn.completed"), `expected turn.completed in [${names}]`);
      assert.ok(names.includes("assistant.text.delta"), `expected assistant.text.delta in [${names}]`);

      // Every conversation event carries the stable identity contract.
      const conversationEvents = events.filter((entry) =>
        ["turn.started", "assistant.text.delta", "tool.started", "tool.completed", "confirmation.required", "turn.completed", "turn.failed"].includes(entry.event),
      );
      for (const entry of conversationEvents) {
        assert.equal(entry.data.chatId, chatId);
        assert.equal(entry.data.turnId, events[0].data.turnId);
        assert.ok(Number.isInteger(entry.data.seq) && entry.data.seq > 0, "seq must be a positive integer");
      }
      const seqs = conversationEvents.map((entry) => entry.data.seq);
      for (let index = 1; index < seqs.length; index += 1) {
        assert.ok(seqs[index] > seqs[index - 1], "conversation seq must be monotonic");
      }

      const completed = conversationEvents.find((entry) => entry.event === "turn.completed").data;
      assert.equal(completed.message.content, ANSWER);
      assert.equal(completed.message.role, "assistant");
    });

    await t.test("provider failure persists a retryable turn.failed and a fresh request recovers", async () => {
      // An empty fake provider response queue makes every harness model call
      // fail with a retryable provider error => HTTP 503 dependency_unavailable.
      await startAgentServer({ ai: FAILING_AI() });
      // Re-resolve identity + chat rows after the fresh server (same DB).
      makeAuthToken = async () => signIdentityForTest(TEST_ACTOR_OID(userId), {
        secret: IDENTITY_SECRET,
        issuer: "mewmo-web",
        audience: "mewmo-agent",
      });

      const failedRequestId = `fail-${randomUUID()}`;
      const failed = await postMessage(chatId, { clientRequestId: failedRequestId, content: "this will fail" });
      assert.equal(failed.status, 503);

      const failedTurn = await db.aiTurn.findUnique({
        where: { chatId_clientRequestId: { chatId, clientRequestId: failedRequestId } },
      });
      assert.ok(failedTurn);
      assert.equal(failedTurn.status, "failed");
      assert.equal(failedTurn.errorCode, "dependency_unavailable");

      // A fresh clientRequestId on a healthy fake provider recovers.
      await startAgentServer({}); // default healthy fake provider
      makeAuthToken = async () => signIdentityForTest(TEST_ACTOR_OID(userId), {
        secret: IDENTITY_SECRET,
        issuer: "mewmo-web",
        audience: "mewmo-agent",
      });
      const retry = await postMessage(chatId, { clientRequestId: randomUUID(), content: "recover now" });
      assert.equal(retry.status, 200);
      const retryBody = await retry.json();
      assert.equal(retryBody.assistantMessage.content, ANSWER);
    });
  } finally {
    if (app) {
      await app.close().catch(() => {});
      app = null;
    }
    // Note: do not $disconnect() the shared getPrisma() singleton here — the
    // integration harness owns the client lifecycle and cleans the test user
    // up afterwards (see tooling/run-api-integration-tests.mjs cleanupTestUser).
  }
});
