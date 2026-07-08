import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/web/src/components/editor/NoteEditor.tsx", "utf8");

test("draft restore effect does not loop when parent content callback changes", () => {
  assert.match(
    source,
    /const onContentChangeRef = useRef\(onContentChange\)/,
    "NoteEditor should keep the latest content callback in a ref",
  );
  assert.match(
    source,
    /onContentChangeRef\.current = onContentChange/,
    "NoteEditor should refresh the content callback ref each render",
  );
  assert.match(
    source,
    /onContentChangeRef\.current\?\.\(draft\.content\)/,
    "draft restoration should call the callback ref instead of closing over a changing callback",
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*readNoteContentDraft\(noteId\)[\s\S]*onContentChangeRef\.current\?\.\(draft\.content\)[\s\S]*retryStoredNoteContent\(noteId, draft\.content\)[\s\S]*\}, \[noteId\]\)/,
    "draft restoration should run only when the note changes",
  );
});
