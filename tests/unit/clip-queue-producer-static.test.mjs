import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("favorite route uses the persistent AI Run producer", () => {
  const route = readFileSync(
    "apps/web/src/app/api/feed-entries/[id]/favorite/route.ts",
    "utf8",
  );

  assert.match(route, /import\s*\{[^}]*enqueueArticleRuns[^}]*\}/);
  assert.doesNotMatch(route, /@mewmo\/queue|addSummaryJob|createQueueHelpers\(\)/);
});
