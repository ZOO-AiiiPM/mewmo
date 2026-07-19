import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("workspace section switches return bounded note previews instead of every note body", () => {
  const listData = read("apps/web/src/lib/note-list-data.ts");
  const detailPage = read("apps/web/src/app/(app)/notes/[slug]/page.tsx");
  const route = read("apps/web/src/app/api/notes/route.ts");

  assert.match(listData, /LEFT\(content,\s*\$\{NOTE_PREVIEW_SOURCE_LIMIT\}\)/);
  assert.match(listData, /preview:\s*notePreviewText/);
  assert.doesNotMatch(listData, /SELECT\s+\*/);
  assert.match(detailPage, /listNotesWithPreviews/);
  assert.match(route, /listNotesWithPreviews/);
});

test("the notes section entry is lightweight and its list API omits full bodies", () => {
  const page = read("apps/web/src/app/(app)/notes/page.tsx");
  const route = read("apps/web/src/app/api/notes/route.ts");

  assert.doesNotMatch(page, /getPrisma|prisma\.note/);
  assert.match(page, /<NoteEditorPage notes=\{\[\]\}/);
  assert.match(route, /listNotesWithPreviews/);
  assert.doesNotMatch(route, /content:\s*true/);
});

test("clip list API returns preview metadata without every clip body", () => {
  const route = read("apps/web/src/app/api/clips/route.ts");
  const listSelect =
    route.match(/const clipListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(listSelect, "clips route should define default clipListSelect");
  assert.doesNotMatch(
    listSelect,
    /content:\s*true/,
    "default clip list should not select full content",
  );
  assert.match(
    route,
    /includeContent/,
    "body content should require an explicit query opt-in",
  );
});

test("clips reuse browser-session list and detail data while refreshing in the background", () => {
  const source = read("apps/web/src/app/(app)/clips/page.tsx");
  const detail = read("apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx");

  assert.match(source, /workspaceResourceKeys/);
  assert.match(detail, /workspaceResourceKeys/);
  assert.match(source, /getCachedWorkspaceList<ClipListItem>\("clips"\)/);
  assert.match(source, /getCachedWorkspaceDetail<ClipListItem>\("clips",/);
  assert.match(source, /setCachedWorkspaceList\("clips", data\)/);
  assert.match(source, /setCachedWorkspaceDetail\("clips", data\)/);
  assert.match(source, /isWorkspaceDetailFresh\("clips", clipToLoad\)/);
  assert.match(
    source,
    /loadWorkspaceResource\(workspaceResourceKeys\.clipDetail\(clipToLoad\.id\)/,
  );
  assert.match(
    source,
    /res\.status === 404[\s\S]{0,120}removeCachedWorkspaceItem/,
  );
  assert.match(detail, /setCachedWorkspaceList\("clips", initialClips\)/);
  assert.match(detail, /setCachedWorkspaceDetail\("clips", clip\)/);
  assert.match(
    detail,
    /loadWorkspaceResource\(workspaceResourceKeys\.clipDetail\(item\.id\)/,
  );
  assert.doesNotMatch(source, /setIsLoading\(true\)/);
});

test("clip readers distinguish a pending body from a confirmed empty body", () => {
  const page = read("apps/web/src/app/(app)/clips/page.tsx");
  const renderer = read(
    "apps/web/src/components/clips/ClipContentRenderer.tsx",
  );

  assert.match(page, /isSelectedClipLoading/);
  assert.match(page, /loading=\{isSelectedClipLoading[^}]*\}/);
  assert.match(renderer, /loading\?: boolean/);
  assert.match(renderer, /正在加载正文/);
});

test("notes seed and reuse browser-session details across section switches", () => {
  const source = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(source, /workspaceResourceKeys/);
  assert.match(source, /getCachedWorkspaceList<NoteListItem>\("notes"\)/);
  assert.match(source, /getCachedWorkspaceSelection\("notes"\)/);
  assert.match(
    source,
    /loadWorkspaceResource\(workspaceResourceKeys\.notesList\(\)/,
  );
  assert.match(source, /setCachedWorkspaceList\("notes",/);
  assert.match(source, /setCachedWorkspaceDetail\("notes",/);
  assert.match(
    source,
    /loadWorkspaceResource\(workspaceResourceKeys\.noteDetail\(item\.id\)/,
  );
  assert.match(source, /if \(selectedNote\) loadNoteDetail\(selectedNote\)/);
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

test("workspace cache is scoped by immutable user id", () => {
  const shell = read("apps/web/src/components/shell/AppShell.tsx");
  const account = read("apps/web/src/lib/workspace-account.tsx");

  assert.match(shell, /scopeWorkspaceDataCache\(user\?\.id\)/);
  assert.doesNotMatch(shell, /scopeWorkspaceDataCache\(user\?\.email\)/);
  assert.match(shell, /WorkspaceAccountProvider/);
  assert.match(account, /WorkspaceAccountContext/);
  assert.match(account, /useWorkspaceAccountId/);
});

test("workspace pages share one cache-first background-refresh hook", () => {
  const hook = read("apps/web/src/lib/use-workspace-resource.ts");

  assert.match(hook, /getWorkspaceResource/);
  assert.match(hook, /refreshWorkspaceResource/);
  assert.match(hook, /setWorkspaceResource/);
  assert.match(hook, /WorkspaceScopeChangedError/);
  assert.match(hook, /initialLoading/);
  assert.match(hook, /refreshing/);
});

test("today follows the shared list and detail cache contract", () => {
  const page = read("apps/web/src/app/(app)/today/page.tsx");

  assert.match(page, /workspaceResourceKeys/);
  assert.match(page, /useWorkspaceResource/);
});

test("all content workspaces use the shared cache contract", () => {
  for (const path of [
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
    "apps/web/src/app/(app)/clips/page.tsx",
    "apps/web/src/app/(app)/feeds/page.tsx",
    "apps/web/src/app/(app)/today/page.tsx",
    "apps/web/src/app/(app)/trash/page.tsx",
    "apps/web/src/app/(app)/knowledge-bases/page.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /workspaceResourceKeys/);
    assert.match(
      source,
      /loadWorkspaceResource|refreshWorkspaceResource|useWorkspaceResource/,
    );
  }
});
