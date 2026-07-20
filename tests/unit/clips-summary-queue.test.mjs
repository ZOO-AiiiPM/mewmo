import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("apps/web/src/app/api/clips/[id]/route.ts", "utf8");

test("completed synchronous clip extraction enqueues a summary job", () => {
  assert.match(route, /fetchClipFromUrl\(clip\.url\)[\s\S]*enqueueSummary/,
    "summary generation should start only after synchronous extraction stores readable content");
  assert.match(route, /addSummaryJob\([\s\S]*userId,\s*targetId:\s*clipId,\s*targetType:\s*"clip"/s);
});
