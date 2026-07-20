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
