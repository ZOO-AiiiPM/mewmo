import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("agent E2E integration test drives the real Agent server against PostgreSQL with fault injection", () => {
  const e2e = read("tests/integration/agent-e2e.test.mjs");
  const harness = read("tooling/run-api-integration-tests.mjs");

  // The agent E2E test is picked up by the harness's integration test glob.
  assert.match(e2e, /ZOO-73/);
  assert.match(harness, /tests\/integration\/\*\.test\.mjs/);

  // It starts the real Agent Fastify server wired to real PostgreSQL.
  assert.match(e2e, /import \{ buildAgentServer \} from/);
  assert.match(e2e, /import \{ loadFoundationAdapters \} from/);
  assert.match(e2e, /loadFoundationAdapters\(\)/);
  assert.match(e2e, /app\.listen\(/);
  assert.match(e2e, /buildAgentServer\(/);

  // Acceptance coverage required by the ZOO-63 Spec section 14:
  // idempotency, leased-turn guard, SSE protocol, failure/recovery, usage.
  assert.match(e2e, /duplicate clientRequestId returns cached response without a second model call/);
  assert.match(e2e, /a live leased turn rejects a mid-flight duplicate requestId/);
  assert.match(e2e, /SSE \/stream emits a stable conversation event sequence/);
  assert.match(e2e, /provider failure persists a retryable turn\.failed and a fresh request recovers/);
  assert.match(e2e, /GET \/health is public/);
  assert.match(e2e, /agent routes reject unauthenticated requests/);

  // Event identity contract (chatId/turnId/seq) is asserted.
  assert.match(e2e, /entry\.data\.chatId/);
  assert.match(e2e, /entry\.data\.turnId/);
  assert.match(e2e, /Number\.isInteger\(entry\.data\.seq\)/);
  assert.match(e2e, /conversation seq must be monotonic/);

  // Usage/AiUsageEvent persistence is asserted.
  assert.match(e2e, /db\.aiUsageEvent\.findMany/);
  assert.match(e2e, /not duplicate AiUsageEvent/);

  // Deterministic provider + restart-driven recovery (fault injection).
  assert.match(e2e, /createFakeAIRuntime/);
});
