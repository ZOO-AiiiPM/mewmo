import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("workspace section switches avoid loading every note body in the server payload", () => {
  for (const file of [
    "apps/web/src/app/(app)/notes/[slug]/page.tsx",
    "apps/web/src/app/api/notes/route.ts",
  ]) {
    const source = read(file);
    const listSelect = source.match(/const noteListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

    assert.ok(listSelect, `${file} should define noteListSelect`);
    assert.doesNotMatch(listSelect, /content:\s*true/, `${file} note list should not select full content`);
  }
});

test("the notes section entry is lightweight and its list API omits full bodies", () => {
  const page = read("apps/web/src/app/(app)/notes/page.tsx");
  const route = read("apps/web/src/app/api/notes/route.ts");
  const listSelect = route.match(/const noteListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.doesNotMatch(page, /getPrisma|prisma\.note/);
  assert.match(page, /<NoteEditorPage notes=\{\[\]\}/);
  assert.ok(listSelect, "notes route should define noteListSelect");
  assert.doesNotMatch(listSelect, /content:\s*true/);
});

test("clip list API returns preview metadata without every clip body", () => {
  const route = read("apps/web/src/app/api/clips/route.ts");
  const listSelect = route.match(/const clipListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(listSelect, "clips route should define default clipListSelect");
  assert.doesNotMatch(listSelect, /content:\s*true/, "default clip list should not select full content");
  assert.match(route, /includeContent/, "body content should require an explicit query opt-in");
});

test("clips reuse browser-session list and detail data while refreshing in the background", () => {
  const source = read("apps/web/src/app/(app)/clips/page.tsx");
  const detail = read("apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx");

  assert.match(source, /getCachedWorkspaceList<ClipListItem>\("clips"\)/);
  assert.match(source, /getCachedWorkspaceDetail<ClipListItem>\("clips",/);
  assert.match(source, /setCachedWorkspaceList\("clips", data\)/);
  assert.match(source, /setCachedWorkspaceDetail\("clips", data\)/);
  assert.match(source, /isWorkspaceDetailFresh\("clips", clipToLoad\)/);
  assert.match(source, /loadWorkspaceResource\(`clips:detail:\$\{clipToLoad\.id\}`/);
  assert.match(source, /res\.status === 404[\s\S]{0,120}removeCachedWorkspaceItem/);
  assert.match(detail, /setCachedWorkspaceList\("clips", initialClips\)/);
  assert.match(detail, /setCachedWorkspaceDetail\("clips", clip\)/);
  assert.match(detail, /loadWorkspaceResource\(`clips:detail:\$\{item\.id\}`/);
});

test("clip readers distinguish a pending body from a confirmed empty body", () => {
  const page = read("apps/web/src/app/(app)/clips/page.tsx");
  const renderer = read("apps/web/src/components/clips/ClipContentRenderer.tsx");

  assert.match(page, /isSelectedClipLoading/);
  assert.match(page, /loading=\{isSelectedClipLoading[^}]*\}/);
  assert.match(renderer, /loading\?: boolean/);
  assert.match(renderer, /正在加载正文/);
});

test("notes seed and reuse browser-session details across section switches", () => {
  const source = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(source, /getCachedWorkspaceList<NoteListItem>\("notes"\)/);
  assert.match(source, /getCachedWorkspaceSelection\("notes"\)/);
  assert.match(source, /loadWorkspaceResource\("notes:list"/);
  assert.match(source, /setCachedWorkspaceList\("notes",/);
  assert.match(source, /setCachedWorkspaceDetail\("notes",/);
  assert.match(source, /loadWorkspaceResource\(`notes:detail:\$\{item\.id\}`/);
  assert.match(
    source,
    /if \(selectedNote\) loadNoteDetail\(selectedNote\)/,
  );
  assert.match(source, /updateCachedWorkspaceItem<NoteListItem>/);
  assert.match(source, /removeCachedWorkspaceItem\("notes", item\.id\)/);
});

test("primary note and clip navigation enters lightweight cached section routes", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(sidebar, /section === "notes" \|\| section === "clips"/);
  assert.match(
    sidebar,
    /section === "notes" \|\| section === "clips"[\s\S]{0,100}\? entry\.href/,
  );
});
