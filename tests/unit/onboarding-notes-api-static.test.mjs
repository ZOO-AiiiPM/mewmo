import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notesRoute = readFileSync("apps/web/src/app/api/notes/route.ts", "utf8");

test("notes list returns pinned onboarding content first", () => {
  assert.match(
    notesRoute,
    /orderBy:\s*\[\s*\{ pinned: "desc" \},\s*\{ updatedAt: "desc" \}\s*\]/,
  );
});
