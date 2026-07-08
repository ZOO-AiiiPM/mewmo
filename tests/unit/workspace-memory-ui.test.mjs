import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("sidebar returns to remembered section routes without resetting scroll", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(sidebar, /useRememberedWorkspaceHref/);
  assert.match(sidebar, /getRememberedFeedTypeHref/);
  assert.match(sidebar, /getRememberedKnowledgeBaseHref/);
  assert.match(sidebar, /useRememberedWorkspaceHref\("today",\s*"\/today"\)/);
  assert.match(sidebar, /router\.push\(getRememberedFeedTypeHref\(type,/);
  assert.match(sidebar, /router\.push\(getRememberedKnowledgeBaseHref\(base\.id,/);
  assert.match(sidebar, /scroll=\{false\}/);
  assert.match(sidebar, /router\.push\([\s\S]*?,\s*\{\s*scroll:\s*false\s*\}\)/);
});

test("workspace pages persist route and column scroll memory", () => {
  const pages = [
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
    "apps/web/src/app/(app)/clips/page.tsx",
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
    "apps/web/src/app/(app)/feeds/page.tsx",
    "apps/web/src/app/(app)/knowledge-bases/page.tsx",
    "apps/web/src/app/(app)/today/page.tsx",
  ];

  for (const file of pages) {
    const source = read(file);
    assert.match(source, /useWorkspaceMemory/, `${file} should use workspace memory`);
    assert.match(source, /bodyRef=\{[a-zA-Z]+Ref\}/, `${file} should pass a list body ref`);
  }
});

test("workspace list scroll restore retries past initial render settling", () => {
  const memory = read("apps/web/src/lib/workspace-memory.ts");

  assert.match(
    memory,
    /restoreTimers/,
    "list scroll restoration should keep retry timers, not rely only on the first paint",
  );
  assert.match(
    memory,
    /250/,
    "list scroll restoration should retry after late list content has mounted",
  );
  assert.match(
    memory,
    /600/,
    "list scroll restoration should retry after async card layout has settled",
  );
  assert.match(
    memory,
    /900/,
    "list scroll restoration should retry once more for image and virtual-list measurement",
  );
});

test("workspace scroll memory saves the last observed scroll instead of rereading reset DOM on cleanup", () => {
  const memory = read("apps/web/src/lib/workspace-memory.ts");

  assert.match(
    memory,
    /latestListScrollRef/,
    "list scroll memory should keep the last observed scroll position outside cleanup timing",
  );
  assert.match(
    memory,
    /recordListScroll/,
    "list scroll should be captured when the list actually scrolls or receives interaction",
  );
  assert.match(
    memory,
    /list\?\.addEventListener\("scroll",\s*recordAndScheduleListSave/,
    "scroll events should capture the latest list position before debounced persistence",
  );
  assert.match(
    memory,
    /return \(\) => \{[\s\S]*save\(\);[\s\S]*removeEventListener\("scroll",\s*recordAndScheduleListSave\)/,
    "cleanup should persist the last observed value, not reread a potentially reset list DOM value",
  );
});

test("today restores its last local selection", () => {
  const source = read("apps/web/src/app/(app)/today/page.tsx");

  assert.match(source, /getRememberedWorkspaceSelection\("today"\)/);
  assert.match(source, /rememberWorkspaceSelection\("today"/);
});

test("remembered navigation hrefs update after hydration instead of during server render", () => {
  const memory = read("apps/web/src/lib/workspace-memory.ts");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const feeds = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(memory, /useRememberedWorkspaceHref/);
  assert.match(memory, /useRememberedFeedTypeHref/);
  assert.match(memory, /WORKSPACE_MEMORY_CHANGE_EVENT/);
  assert.match(
    memory,
    /useRememberedWorkspaceHref[\s\S]*const \[href, setHref\] = useState\(fallback\)/,
    "remembered workspace links must render the fallback first so SSR and hydration attributes match",
  );
  assert.match(
    memory,
    /useRememberedFeedTypeHref[\s\S]*const \[href, setHref\] = useState\(fallback\)/,
    "remembered feed links must render the fallback first so SSR and hydration attributes match",
  );
  assert.match(sidebar, /useRememberedWorkspaceHref/);
  assert.match(listColumn, /useRememberedWorkspaceHref/);
  assert.match(feeds, /useRememberedFeedTypeHref/);

  for (const source of [sidebar, listColumn]) {
    assert.doesNotMatch(source, /href=\{getRememberedWorkspaceHref\(/);
  }
  assert.doesNotMatch(feeds, /href=\{getRememberedFeedTypeHref\(/);
});
