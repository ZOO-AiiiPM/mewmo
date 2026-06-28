import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/web/src/components/editor/NoteEditor.tsx", "utf8");

test("note editor uses MDXEditor instead of Atomic", () => {
  assert.match(source, /@mdxeditor\/editor/);
  assert.match(source, /\bMDXEditor\b/);
  assert.doesNotMatch(source, /AtomicCodeMirrorEditor/);
  assert.doesNotMatch(source, /@atomic-editor\/editor/);
});

test("note editor does not enable the MDXEditor toolbar plugin", () => {
  assert.doesNotMatch(source, /\btoolbarPlugin\b/);
});
