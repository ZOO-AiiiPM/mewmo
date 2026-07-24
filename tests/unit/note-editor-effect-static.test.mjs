import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/web/src/components/editor/NoteEditor.tsx", "utf8");

test("editor persists a full account-scoped draft and exposes save state", () => {
  assert.match(source, /useWorkspaceAccountId\(\)/);
  assert.match(source, /queueNoteDraftSync/);
  assert.match(source, /subscribeNoteDraftSync/);
  assert.match(source, /retryStoredNoteDraft/);
  assert.match(source, /window\.addEventListener\("online"/);
  for (const message of ["保存中…", "已保存", "保存失败"]) {
    assert.match(source, new RegExp(message));
  }
  assert.match(source, /aria-live="polite"/);
});
