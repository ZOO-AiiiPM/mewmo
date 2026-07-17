import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("today list omits full note clip and feed bodies", () => {
  const route = read("apps/web/src/app/api/today/route.ts");

  assert.doesNotMatch(route, /content:\s*true/);
  assert.doesNotMatch(route, /content:\s*(note|clip|entry)\.content/);
});

test("today renders cached list before background refresh and loads selected detail", () => {
  const page = read("apps/web/src/app/(app)/today/page.tsx");

  assert.match(page, /workspaceResourceKeys\.todayList\(\)/);
  assert.match(page, /useWorkspaceResource/);
  assert.match(page, /workspaceResourceKeys\.noteDetail\(item\.id\)/);
  assert.match(page, /workspaceResourceKeys\.clipDetail\(item\.id\)/);
  assert.match(page, /workspaceResourceKeys\.feedEntryDetail\(item\.id\)/);
  assert.match(page, /setWorkspaceResource\(workspaceResourceKeys\.noteDetail\(note\.id\), note\)/);
});
