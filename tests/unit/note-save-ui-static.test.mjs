import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("note save status shares the metadata row and versions propagate to page cache", () => {
  const editor = read("apps/web/src/components/editor/NoteEditor.tsx");
  const page = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const today = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledge = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    editor,
    /<div className="mewmo-note-editor__meta">[\s\S]*\{saveStatus\}[\s\S]*\{conflictActions\}/,
  );
  assert.match(css, /\.mewmo-note-save-status\s*\{[\s\S]*margin-left:\s*auto/);
  assert.match(page, /onSaveSnapshot=\{handleNoteSaveSnapshot\}/);
  assert.match(today, /onSaveSnapshot=\{handleSelectedNoteSave\}/);
  assert.match(knowledge, /onSaveSnapshot=\{onNoteSave\}/);
  assert.match(page, /pinned:\s*updated\.pinned,[\s\S]*version:\s*updated\.version/);
});
