import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeDrivenListFiles = [
  "apps/web/src/app/(app)/notes/page.tsx",
  "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  "apps/web/src/app/(app)/clips/page.tsx",
  "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
];

test("workspace list card links preserve the current list scroll position when used", () => {
  for (const file of routeDrivenListFiles) {
    const source = readFileSync(file, "utf8");
    const listCardLinks = [...source.matchAll(/<Link\b[\s\S]*?>/g)]
      .map((match) => match[0])
      .filter((tag) => tag.includes("mewmo-list-card"));

    for (const tag of listCardLinks) {
      assert.match(tag, /\bscroll=\{false\}/, `${file} list card Link should set scroll={false}`);
    }
  }
});

test("workspace item selection keeps the left list mounted instead of navigating detail routes", () => {
  const notesDetail = readFileSync(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
    "utf8",
  );
  const clipsIndex = readFileSync("apps/web/src/app/(app)/clips/page.tsx", "utf8");
  const clipsDetail = readFileSync(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
    "utf8",
  );

  for (const [file, source] of [
    ["notes detail", notesDetail],
    ["clips index", clipsIndex],
    ["clips detail", clipsDetail],
  ]) {
    assert.doesNotMatch(
      source,
      /<Link\b[\s\S]*?className=\{?`?[^`"}]*mewmo-list-card[\s\S]*?href=\{?`\/(?:notes|clips)\/\$\{/,
      `${file} list cards should switch the reader in place, not navigate to another detail route`,
    );
    assert.match(
      source,
      /pushStableSelectionUrl/,
      `${file} should still sync the selected item into the URL`,
    );
  }
});

test("autosave preview updates do not change local sort timestamps immediately", () => {
  const todayPage = readFileSync("apps/web/src/app/(app)/today/page.tsx", "utf8");
  const knowledgePage = readFileSync(
    "apps/web/src/app/(app)/knowledge-bases/page.tsx",
    "utf8",
  );
  const noteDetail = readFileSync(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
    "utf8",
  );

  for (const [name, source] of [
    ["today", todayPage],
    ["knowledge bases", knowledgePage],
    ["notes", noteDetail],
  ]) {
    assert.doesNotMatch(
      source,
      /updateSelectedNoteContent[\s\S]{0,420}new Date\(\)\.toISOString/,
      `${name} content autosave preview should not bump the local sort timestamp`,
    );
    assert.doesNotMatch(
      source,
      /updateSelectedNoteTitle[\s\S]{0,420}new Date\(\)\.toISOString/,
      `${name} title autosave preview should not bump the local sort timestamp`,
    );
  }
});

test("workspace query-param selection preserves the current list scroll position", () => {
  const feedsPage = readFileSync("apps/web/src/app/(app)/feeds/page.tsx", "utf8");
  const knowledgePage = readFileSync("apps/web/src/app/(app)/knowledge-bases/page.tsx", "utf8");

  assert.match(
    feedsPage,
    /router\.push\(`\$\{pathname\}\?\$\{next\.toString\(\)\}`,\s*\{\s*scroll:\s*false\s*\}\)/,
  );
  assert.match(
    knowledgePage,
    /router\.push\(\s*queryString \? `\$\{pathname\}\?\$\{queryString\}` : pathname,\s*\{\s*scroll:\s*false\s*,?\s*\}\s*\)/,
  );
});

test("workspace memory snapshots list scroll before item navigation begins", () => {
  const source = readFileSync("apps/web/src/lib/workspace-memory.ts", "utf8");

  assert.match(source, /addEventListener\("pointerdown",\s*recordAndSave/);
  assert.match(source, /addEventListener\("keydown",\s*saveBeforeKeyboardNavigation/);
});
