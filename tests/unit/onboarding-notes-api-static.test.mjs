import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notesRoute = readFileSync("apps/web/src/app/api/notes/route.ts", "utf8");
const noteListData = readFileSync("apps/web/src/lib/note-list-data.ts", "utf8");

test("notes list returns pinned onboarding content first", () => {
  assert.match(
    noteListData,
    /ORDER BY pinned DESC, updated_at DESC/,
  );
  assert.match(notesRoute, /listNotesWithPreviews\(session\.user\.id\)/);
});
