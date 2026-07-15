import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("apps/web/src/app/api/clips/[id]/route.ts", "utf8");

test("completed background clip extraction enqueues a summary job", () => {
  assert.match(route, /fetchClipFromUrl\(clip\.url\)[\s\S]*addSummaryJob/,
    "summary generation should start only after background extraction stores readable content");
  assert.match(route, /userId:\s*clip\.userId,\s*targetId:\s*clip\.id,\s*targetType:\s*"clip"/s);
});
