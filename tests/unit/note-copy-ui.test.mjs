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
    /buildNoteCopyMarkdown\(\{[\s\S]*title: selectedNote\.title[\s\S]*markdown: selectedNote\.content/,
  );
  assert.doesNotMatch(page, /const \[editorContent, setEditorContent\]/);
  assert.match(page, /copyNoteMarkdownToClipboard\(/);
  assert.match(page, /showToast\("已复制全文", "success"\)/);
  assert.match(page, /showToast\("复制全文失败", "error"\)/);
  assert.match(page, /onCopyContent=\{[\s\S]*selectedNote\?\.content !== undefined/);
});

test("all note reader surfaces copy current local markdown", () => {
  const notes = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const today = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledge = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");

  for (const source of [notes, today, knowledge]) {
    assert.match(source, /buildNoteCopyMarkdown\(/);
    assert.match(source, /copyNoteMarkdownToClipboard\(/);
    assert.match(source, /showToast\("已复制全文", "success"\)/);
    assert.match(source, /showToast\("复制全文失败", "error"\)/);
    assert.match(source, /onCopyContent=/);
  }

  assert.match(today, /selected\?\.type === "note"/);
  assert.match(knowledge, /selectedItem\?\.kind === "note"/);
});
