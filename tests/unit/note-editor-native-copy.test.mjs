import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "apps/web/src/components/editor/NoteEditor.tsx",
  "utf8",
);

test("note editor normalizes legacy breaks before Crepe initialization", () => {
  assert.match(source, /normalizeNoteMarkdownBreaks/);
  assert.match(
    source,
    /normalizeNoteMarkdownBreaks\(\s*resolveInitialNoteContent\(/,
  );
});

test("note editor leaves selection copy to the browser", () => {
  assert.doesNotMatch(source, /onCopy\s*=|handleCopy|clipboardData\.setData/);
});
