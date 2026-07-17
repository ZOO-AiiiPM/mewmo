import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/src/app/(app)/trash/page.tsx", "utf8");

test("trash keeps cached list and detail visible while refreshing", () => {
  assert.match(page, /workspaceResourceKeys\.trashList\(\)/);
  assert.match(page, /workspaceResourceKeys\.trashDetail\(item\.type, item\.id\)/);
  assert.match(page, /useWorkspaceResource/);
  assert.match(page, /getWorkspaceResource<TrashItem>/);
  assert.match(page, /refreshWorkspaceResource/);
});

test("trash mutations update their owner cache and invalidate dependent lists", () => {
  assert.match(page, /updateItems\(\(current\) => current\.filter/);
  assert.match(page, /invalidateWorkspaceResource\(workspaceResourceKeys\.trashDetail/);
  assert.match(page, /invalidateWorkspaceResource\(workspaceResourceKeys\.todayList\(\)\)/);
  assert.match(page, /invalidateWorkspaceResourcePrefix\("knowledge:contents:"\)/);
  assert.match(page, /invalidateWorkspaceResource\(workspaceResourceKeys\.notesList\(\)\)/);
  assert.match(page, /invalidateWorkspaceResource\(workspaceResourceKeys\.clipsList\(\)\)/);
  assert.match(page, /invalidateWorkspaceResourcePrefix\("feeds:sources:"\)/);
  assert.match(page, /invalidateWorkspaceResource\(workspaceResourceKeys\.knowledgeBases\(\)\)/);
});
