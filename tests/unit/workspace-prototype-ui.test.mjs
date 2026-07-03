import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("notes and clips shell uses prototype icon component instead of text glyph controls", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");

  for (const source of [sidebar, listColumn, readerToolbar]) {
    assert.match(source, /PrototypeIcon/, "shell controls should render the baked prototype icon set");
  }

  assert.doesNotMatch(sidebar, /function NavIcon/, "sidebar must not keep the handwritten svg switch");
  assert.doesNotMatch(listColumn, />\+<|>\/<|>→</, "list column must not use text characters as icons");
  assert.doesNotMatch(readerToolbar, />‹<|>›<|>···|>⊞<|>⊟</, "reader toolbar must not use text characters as icons");
});

test("notes and clips list cards expose prototype actions, search, tags, and pinned state", () => {
  const sharedList = read("apps/web/src/components/shell/ListColumn.tsx");
  const notesIndex = read("apps/web/src/app/(app)/notes/page.tsx");
  const noteDetail = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");

  assert.match(sharedList, /onSearchChange/, "search input must report its query to callers");
  assert.match(sharedList, /href="\/notes"/, "title menu quick switch must navigate to notes");
  assert.match(sharedList, /href="\/clips"/, "title menu quick switch must navigate to clips");

  for (const source of [notesIndex, noteDetail, clipsIndex]) {
    assert.match(source, /mewmo-list-card__action/, "cards need hover more-actions");
    assert.match(source, /contentTags/, "cards should render content tag pills instead of type pills");
  }

  assert.match(notesIndex, /PinIcon/, "notes index should show the pinned marker with an icon");
  assert.match(noteDetail, /PinIcon/, "note detail list should show the pinned marker with an icon");
});

test("reader area includes wired list collapse and scroll toc affordances", () => {
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const noteDetail = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(readerToolbar, /onToggleList/, "toolbar should keep a wired list toggle");
  assert.match(noteDetail, /mewmo-doc-toc/, "note editor page should render the floating document toc");
  assert.match(css, /\.mewmo-workspace--list-collapsed/, "workspace must visually collapse the list column");
  assert.match(css, /\.mewmo-doc-toc/, "floating document toc styles should be present");
  assert.match(css, /\.mewmo-spinner/, "loading states should have a spinner");
});
