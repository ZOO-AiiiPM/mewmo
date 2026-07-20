import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("apps/web/src/app/api/clips/[id]/route.ts", "utf8");

test("completed synchronous clip extraction enqueues persistent AI runs", () => {
  assert.match(route, /fetchClipFromUrl\(clip\.url\)[\s\S]*enqueueWorkflows/,
    "AI workflows should start only after readable content is stored");
  assert.match(route, /enqueueArticleRuns\(\{[\s\S]*targetType:\s*"clip"[\s\S]*inputVersion:\s*clip\.version/s);
  assert.doesNotMatch(route, /addSummaryJob|@mewmo\/queue/);
});
