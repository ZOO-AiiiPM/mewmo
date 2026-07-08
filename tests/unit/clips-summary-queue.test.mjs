import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("apps/web/src/app/api/clips/route.ts", "utf8");

test("clip creation enqueues a summary job for saved clips", () => {
  assert.match(route, /createQueueHelpers/, "clips API should create queue helpers");
  assert.match(route, /addSummaryJob\(\{\s*userId: session\.user\.id,\s*targetId: clip\.id,\s*targetType: "clip"/s);
});
