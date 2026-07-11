import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("renaming a note persists a unique slug and replaces the selected note URL", () => {
  const route = read("apps/web/src/app/api/notes/[id]/route.ts");
  const editor = read("apps/web/src/components/editor/NoteEditor.tsx");
  const page = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(route, /createUniqueNoteSlug/);
  assert.match(route, /updateData\.slug\s*=\s*await createUniqueNoteSlug/);
  assert.match(editor, /updated\.slug/);
  assert.match(page, /pushStableSelectionUrl\(`\/notes\/\$\{slug\}`,[\s\S]{0,40}"replace"\)/);
  assert.match(page, /previousSelectedNoteRef/);
  assert.match(
    page,
    /previous\.id === selectedNote\.id &&[\s\S]{0,80}previous\.slug !== selectedNote\.slug/,
  );
});
