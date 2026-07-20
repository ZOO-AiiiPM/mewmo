import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("favoriting a feed entry queues versioned AI workflows", () => {
  const route = readFileSync("apps/web/src/app/api/feed-entries/[id]/favorite/route.ts", "utf8");

  assert.match(route, /enqueueArticleRuns/);
  assert.match(route, /inputVersion:\s*clip\.version/);
  assert.doesNotMatch(route, /@mewmo\/queue|addSummaryJob|createQueueHelpers/);
});
