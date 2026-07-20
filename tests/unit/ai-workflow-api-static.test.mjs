import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Workflow status and retry APIs require ownership-scoped Application services", () => {
  const status = read("apps/web/src/app/api/ai/runs/[id]/route.ts");
  const retry = read("apps/web/src/app/api/ai/runs/[id]/retry/route.ts");
  for (const route of [status, retry]) {
    assert.match(route, /auth\(\)/);
    assert.match(route, /userId:\s*session\.user\.id/);
    assert.doesNotMatch(route, /getPrisma|@mewmo\/db/);
  }
  assert.match(retry, /status:\s*202/);
});

test("Related APIs expose persistent and temporary Heads Up queries", () => {
  const related = read("apps/web/src/app/api/ai/related/route.ts");
  const query = read("apps/web/src/app/api/ai/related/query/route.ts");
  assert.match(related, /targetType:\s*z\.enum\(\["note",\s*"clip",\s*"feed_entry"\]\)/);
  assert.match(related, /getRelated/);
  assert.match(query, /contentHash/);
  assert.match(query, /queryRelated/);
  assert.doesNotMatch(`${related}\n${query}`, /AISidebar|deep-insight/);
});

test("note writes enqueue versioned embedding work that chains into relations and insight", () => {
  const createRoute = read("apps/web/src/app/api/notes/route.ts");
  const updateRoute = read("apps/web/src/app/api/notes/[id]/route.ts");
  const enqueue = read("apps/web/src/lib/ai-run-enqueue.ts");
  for (const route of [createRoute, updateRoute]) {
    assert.match(route, /enqueueNoteRuns/);
    assert.match(route, /inputVersion:/);
  }
  assert.match(enqueue, /kind:\s*"embedding"/);
  assert.match(enqueue, /targetType:\s*"note"/);
});

test("live workflow evaluation uses Langfuse tracing and fails incomplete runs", () => {
  const live = read("apps/ai-workflows/evals/live.ts");
  const evaluation = read("apps/ai-workflows/evals/summary-eval.ts");
  assert.match(live, /LangfuseClient/);
  assert.match(live, /LangfuseSpanProcessor/);
  assert.match(live, /NodeSDK/);
  assert.match(live, /telemetry\.shutdown/);
  assert.match(live, /hasLiveEvalRegression/);
  assert.match(evaluation, /expectedItemCount === 0/);
  assert.doesNotMatch(live, /requires the Foundation AI Runtime/);
});
