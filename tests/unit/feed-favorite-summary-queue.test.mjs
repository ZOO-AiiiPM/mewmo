import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("favoriting a feed entry reuses the shared summary producer", () => {
  const route = readFileSync("apps/web/src/app/api/feed-entries/[id]/favorite/route.ts", "utf8");

  assert.match(route, /import \{ addSummaryJob \} from "@mewmo\/queue"/);
  assert.match(route, /await addSummaryJob\(/);
  assert.doesNotMatch(route, /createQueueHelpers/);
});
