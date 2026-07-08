import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/web/src/components/editor/NoteEditor.tsx", "utf8");

test("note editor uses Crepe and Milkdown instead of legacy editors", () => {
  assert.match(source, /@milkdown\/crepe/);
  assert.match(source, /@milkdown\/react/);
  assert.match(source, /\bCrepe\b/);
  assert.match(source, /\bMilkdown\b/);
  assert.doesNotMatch(source, /AtomicCodeMirrorEditor/);
  assert.doesNotMatch(source, /@atomic-editor\/editor/);
  assert.doesNotMatch(source, /@mdxeditor\/editor/);
  assert.doesNotMatch(source, /\bMDXEditor\b/);
});

test("note editor does not enable rich editor toolbar chrome", () => {
  assert.match(source, /\[Crepe\.Feature\.Toolbar\]: false/);
  assert.doesNotMatch(source, /\btoolbarPlugin\b/);
});
