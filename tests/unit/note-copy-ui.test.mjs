import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("note overflow menu exposes one copy-full action", () => {
  const toolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  assert.match(toolbar, /onCopyContent\?:/);
  assert.equal((toolbar.match(/复制全文/g) ?? []).length, 1);
  assert.match(
    toolbar,
    /menuKind === "notes"[\s\S]*\{onCopyContent && \([\s\S]*runMenuAction\(onCopyContent\)/,
  );
});

test("note page copies the current title and unsaved editor content", () => {
  const page = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  assert.match(
    page,
    /buildNoteCopyPayload\(\{[\s\S]*title: selectedNote\.title[\s\S]*markdown: editorContent/,
  );
  assert.match(page, /copyNoteToClipboard\(/);
  assert.match(page, /showToast\("已复制全文", "success"\)/);
  assert.match(page, /showToast\("复制全文失败", "error"\)/);
  assert.match(page, /onCopyContent=\{selectedNote/);
});
