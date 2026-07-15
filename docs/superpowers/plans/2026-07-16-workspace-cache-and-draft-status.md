# Workspace Cache and Draft Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every content workspace one account-scoped cache contract, immediate navigation feedback, slim list payloads, and visible local protection for the currently edited note.

**Architecture:** Generalize the existing browser-memory cache into a typed resource store with account generations, accepted timestamps, request deduplication, and invalidation. Migrate Notes, Clips, Feeds, Today, Trash, and Knowledge to cache-first/background-refresh behavior while keeping PostgreSQL authoritative. Reuse the current localStorage note draft path, expand it to title plus body, add optimistic concurrency, and surface save state without building a general offline queue.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Auth.js 5, Prisma 7/PostgreSQL, Vitest, Node test runner, Playwright/browser verification.

**Design:** `docs/superpowers/specs/2026-07-16-workspace-cache-and-draft-status-design.md`

**Supersedes:** The narrow Notes/Clips plan `docs/superpowers/plans/2026-07-10-workspace-performance-cache.md` and Feed plan `docs/superpowers/plans/2026-07-10-feed-session-cache.md` remain historical records; this plan owns the unified contract and remaining migrations.

---

## File map

- `apps/web/src/lib/workspace-data-cache.ts`: generic account-scoped resource records, generation guard, in-flight deduplication, invalidation, and compatibility wrappers.
- `apps/web/src/lib/workspace-resource-keys.ts`: canonical keys for all lists, trees, folder contents, and details.
- `apps/web/src/lib/use-workspace-resource.ts`: shared cache-first/background-refresh React state contract.
- `apps/web/src/lib/workspace-account.tsx`: authenticated user-ID context for editor draft scoping.
- `apps/web/src/lib/workspace-navigation.tsx`: navigation pending state and browser performance marks.
- `apps/web/src/components/shell/WorkspaceRouteLoading.tsx`: route-level workspace skeleton that preserves shell geometry.
- `apps/web/src/lib/server-timing.ts`: small helper for reproducible `Server-Timing` headers on workspace GET APIs.
- `apps/web/src/components/editor/note-draft-store.ts`: account-scoped full current-note draft persistence.
- `apps/web/src/components/editor/note-draft-sync.ts`: latest-draft save coordinator, retry policy, status subscriptions, and stale-response protection.
- Existing page/API/repository files: consume the shared contracts without unrelated visual or schema refactors.

---

### Task 1: Generic account-scoped resource cache

**Files:**
- Create: `apps/web/src/lib/workspace-resource-keys.ts`
- Modify: `apps/web/src/lib/workspace-data-cache.ts`
- Modify: `tests/unit/workspace-data-cache.test.ts`

- [ ] **Step 1: Replace section-specific expectations with failing generic-resource tests**

Add tests covering accepted timestamps, arbitrary resource keys, immutable reads, in-flight deduplication, account generations, invalidation, and stale previous-account responses:

```ts
import {
  WorkspaceScopeChangedError,
  getWorkspaceResource,
  invalidateWorkspaceResource,
  invalidateWorkspaceResourcePrefix,
  refreshWorkspaceResource,
  scopeWorkspaceDataCache,
  setWorkspaceResource,
} from "../../apps/web/src/lib/workspace-data-cache";
import { workspaceResourceKeys } from "../../apps/web/src/lib/workspace-resource-keys";

it("stores arbitrary resources with an accepted timestamp", () => {
  scopeWorkspaceDataCache("user-1");
  setWorkspaceResource(workspaceResourceKeys.todayList(), [{ id: "today-1" }], 123);

  expect(getWorkspaceResource<{ id: string }[]>(workspaceResourceKeys.todayList())).toEqual({
    value: [{ id: "today-1" }],
    acceptedAt: 123,
  });
});

it("rejects a response that resolves after the account generation changes", async () => {
  scopeWorkspaceDataCache("user-1");
  let resolve!: (value: string[]) => void;
  const pending = refreshWorkspaceResource("notes:list", () =>
    new Promise<string[]>((done) => { resolve = done; }),
  );

  scopeWorkspaceDataCache("user-2");
  resolve(["private-user-1"]);

  await expect(pending).rejects.toBeInstanceOf(WorkspaceScopeChangedError);
  expect(getWorkspaceResource("notes:list")).toBeNull();
});
```

- [ ] **Step 2: Run the cache test and confirm the new API is missing**

Run:

```bash
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
```

Expected: FAIL because `workspace-resource-keys` and generic resource exports do not exist.

- [ ] **Step 3: Implement canonical keys and the generic cache core**

Create key builders that include every server-query input:

```ts
export const workspaceResourceKeys = {
  notesList: () => "notes:list",
  noteDetail: (id: string) => `notes:detail:${id}`,
  selection: (section: "notes" | "clips") => `selection:${section}`,
  clipsList: () => "clips:list",
  clipDetail: (id: string) => `clips:detail:${id}`,
  feedSources: (type: string) => `feeds:sources:${type}`,
  feedEntries: (feedId: string) => `feeds:entries:${feedId}`,
  aggregateFeedEntries: (type: string) => `feeds:entries:all:${type}`,
  todayList: () => "today:list",
  trashList: () => "trash:list",
  trashDetail: (kind: string, id: string) => `trash:detail:${kind}:${id}`,
  knowledgeBases: () => "knowledge:bases",
  knowledgeTree: (knowledgeBaseId: string) => `knowledge:tree:${knowledgeBaseId}`,
  knowledgeContents: (knowledgeBaseId: string, folderId: string) =>
    `knowledge:contents:${knowledgeBaseId}:${folderId}`,
  feedEntryDetail: (id: string) => `feeds:detail:${id}`,
};
```

Replace the separate backing maps with one resource store while keeping existing Notes/Clips/Feeds wrappers temporarily compatible:

```ts
export interface WorkspaceResourceRecord<T> {
  value: T;
  acceptedAt: number;
}

export class WorkspaceScopeChangedError extends Error {
  constructor() {
    super("Workspace account changed while the request was running");
    this.name = "WorkspaceScopeChangedError";
  }
}

const resources = new Map<string, WorkspaceResourceRecord<unknown>>();
const inFlight = new Map<string, { generation: number; promise: Promise<unknown> }>();
let activeAccountId: string | null = null;
let activeGeneration = 0;

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  if (Array.isArray(value)) return value.map((item) =>
    item && typeof item === "object" ? { ...item } : item,
  ) as T;
  return value && typeof value === "object" ? { ...value } : value;
}

export function scopeWorkspaceDataCache(accountId: string | null | undefined) {
  if (!cacheAvailable()) return;
  const nextAccountId = accountId ?? null;
  if (nextAccountId === activeAccountId) return;
  activeAccountId = nextAccountId;
  activeGeneration += 1;
  resources.clear();
  inFlight.clear();
}

export function getWorkspaceResource<T>(key: string): WorkspaceResourceRecord<T> | null {
  if (!cacheAvailable()) return null;
  const record = resources.get(key) as WorkspaceResourceRecord<T> | undefined;
  return record ? { value: cloneValue(record.value), acceptedAt: record.acceptedAt } : null;
}

export function setWorkspaceResource<T>(key: string, value: T, acceptedAt = Date.now()) {
  if (!cacheAvailable()) return;
  resources.set(key, { value: cloneValue(value), acceptedAt });
}

export function invalidateWorkspaceResource(key: string) {
  if (!cacheAvailable()) return;
  resources.delete(key);
}

export function invalidateWorkspaceResourcePrefix(prefix: string) {
  if (!cacheAvailable()) return;
  for (const key of resources.keys()) {
    if (key.startsWith(prefix)) resources.delete(key);
  }
}

export async function refreshWorkspaceResource<T>(key: string, loader: () => Promise<T>) {
  if (!cacheAvailable()) return loader();
  const generation = activeGeneration;
  const active = inFlight.get(key);
  if (active?.generation === generation) return active.promise as Promise<T>;

  const promise = loader().then((value) => {
    if (generation !== activeGeneration) throw new WorkspaceScopeChangedError();
    setWorkspaceResource(key, value);
    return value;
  }).finally(() => {
    if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
  });
  inFlight.set(key, { generation, promise });
  return promise;
}
```

Rebuild legacy list/detail/feed wrapper functions on top of these exact mappings so existing consumers remain green while later tasks migrate them:

```ts
const sectionListKey = (section: WorkspaceDataSection) =>
  section === "notes" ? workspaceResourceKeys.notesList() : workspaceResourceKeys.clipsList();
const sectionDetailKey = (section: WorkspaceDataSection, id: string) =>
  section === "notes" ? workspaceResourceKeys.noteDetail(id) : workspaceResourceKeys.clipDetail(id);

export const loadWorkspaceResource = refreshWorkspaceResource;

export function getCachedWorkspaceSelection(section: WorkspaceDataSection) {
  return getWorkspaceResource<string>(workspaceResourceKeys.selection(section))?.value ?? null;
}

export function setCachedWorkspaceSelection(section: WorkspaceDataSection, id: string | null) {
  const key = workspaceResourceKeys.selection(section);
  if (id) setWorkspaceResource(key, id);
  else invalidateWorkspaceResource(key);
}
```

Map feed source wrappers to `feedSources(type)` and feed-entry wrappers to `feedEntries(feedId)`. Preserve the existing newest-10 ordering/cap inside `setCachedFeedEntries`.

- [ ] **Step 4: Run the cache tests**

Run:

```bash
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
```

Expected: PASS, including stale-account response rejection and existing wrapper behavior.

- [ ] **Step 5: Commit the cache foundation**

```bash
git add apps/web/src/lib/workspace-resource-keys.ts apps/web/src/lib/workspace-data-cache.ts tests/unit/workspace-data-cache.test.ts
git commit -m "refactor(cache): unify workspace resource storage"
```

---

### Task 2: Shared page loading contract and immutable account scope

**Files:**
- Create: `apps/web/src/lib/use-workspace-resource.ts`
- Create: `apps/web/src/lib/workspace-account.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/components/shell/AppShell.tsx`
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`

- [ ] **Step 1: Add failing assertions for user-ID scoping and the shared hook**

Add static assertions:

```js
test("workspace cache is scoped by immutable user id", () => {
  const layout = read("apps/web/src/app/(app)/layout.tsx");
  const shell = read("apps/web/src/components/shell/AppShell.tsx");
  assert.match(layout, /<AppShell user=\{session\.user\}/);
  assert.match(shell, /scopeWorkspaceDataCache\(user\?\.id\)/);
  assert.doesNotMatch(shell, /scopeWorkspaceDataCache\(user\?\.email\)/);
});

test("workspace pages share one cache-first background-refresh hook", () => {
  const hook = read("apps/web/src/lib/use-workspace-resource.ts");
  assert.match(hook, /getWorkspaceResource/);
  assert.match(hook, /refreshWorkspaceResource/);
  assert.match(hook, /initialLoading/);
  assert.match(hook, /refreshing/);
});
```

- [ ] **Step 2: Run the static test and verify failure**

```bash
pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs
```

Expected: FAIL because the hook is missing and AppShell scopes by email.

- [ ] **Step 3: Add the account provider and shared hook**

The account context is intentionally small:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceAccountContext = createContext<string | null>(null);

export function WorkspaceAccountProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <WorkspaceAccountContext.Provider value={userId}>{children}</WorkspaceAccountContext.Provider>;
}

export function useWorkspaceAccountId() {
  const userId = useContext(WorkspaceAccountContext);
  if (!userId) throw new Error("Workspace account is unavailable");
  return userId;
}
```

Implement `useWorkspaceResource` with the same state semantics for every page:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WorkspaceScopeChangedError,
  getWorkspaceResource,
  refreshWorkspaceResource,
  setWorkspaceResource,
} from "./workspace-data-cache";

export interface WorkspaceResourceState<T> {
  data: T;
  initialLoading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
  update: (update: T | ((current: T) => T)) => void;
}

export function useWorkspaceResource<T>(options: {
  key: string;
  initialData: T;
  load: () => Promise<T>;
  enabled?: boolean;
  errorMessage: string;
}): WorkspaceResourceState<T> {
  const { key, initialData, load, enabled = true, errorMessage } = options;
  const initialDataRef = useRef(initialData);
  const loadRef = useRef(load);
  initialDataRef.current = initialData;
  loadRef.current = load;

  const cached = getWorkspaceResource<T>(key);
  const [state, setState] = useState(() => ({
    key,
    data: cached?.value ?? initialData,
    initialLoading: enabled && !cached,
    refreshing: false,
    error: "",
  }));

  const visible = state.key === key
    ? state
    : {
        key,
        data: cached?.value ?? initialData,
        initialLoading: enabled && !cached,
        refreshing: false,
        error: "",
      };

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const existing = getWorkspaceResource<T>(key);
    setState((current) => ({
      key,
      data: current.key === key ? current.data : existing?.value ?? initialDataRef.current,
      initialLoading: !existing,
      refreshing: Boolean(existing),
      error: "",
    }));

    try {
      const data = await refreshWorkspaceResource(key, () => loadRef.current());
      setState({ key, data, initialLoading: false, refreshing: false, error: "" });
    } catch (error) {
      if (error instanceof WorkspaceScopeChangedError) return;
      setState((current) => ({
        key,
        data: current.key === key
          ? current.data
          : getWorkspaceResource<T>(key)?.value ?? initialDataRef.current,
        initialLoading: false,
        refreshing: false,
        error: errorMessage,
      }));
    }
  }, [enabled, errorMessage, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback((updater: T | ((current: T) => T)) => {
    setState((current) => {
      const base = current.key === key
        ? current.data
        : getWorkspaceResource<T>(key)?.value ?? initialDataRef.current;
      const data = typeof updater === "function"
        ? (updater as (current: T) => T)(base)
        : updater;
      setWorkspaceResource(key, data);
      return { key, data, initialLoading: false, refreshing: current.refreshing, error: "" };
    });
  }, [key]);

  return {
    data: visible.data,
    initialLoading: visible.initialLoading,
    refreshing: visible.refreshing,
    error: visible.error,
    refresh,
    update,
  };
}
```

`initialLoading` is true only without cache. `refreshing` is true when cached data remains visible during the request. A failed refresh retains `data` and sets `error`.

Update `AppShellProps.user` to include `id`, call `scopeWorkspaceDataCache(user?.id)`, and wrap Sidebar/main/editor descendants in `WorkspaceAccountProvider`.

- [ ] **Step 4: Run targeted cache and static tests**

```bash
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the shared page contract**

```bash
git add apps/web/src/lib/use-workspace-resource.ts apps/web/src/lib/workspace-account.tsx apps/web/src/app/'(app)'/layout.tsx apps/web/src/components/shell/AppShell.tsx tests/unit/workspace-navigation-performance.test.mjs
git commit -m "feat(cache): add shared workspace loading contract"
```

---

### Task 3: Align Notes, Clips, and Feeds with the generic contract

**Files:**
- Modify: `apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx`
- Modify: `apps/web/src/app/(app)/clips/page.tsx`
- Modify: `apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`
- Modify: `tests/unit/feed-session-cache.test.mjs`

- [ ] **Step 1: Add failing assertions for canonical keys and non-destructive refreshes**

Assert each existing page imports `workspaceResourceKeys`, uses the generic refresh path, and does not clear cached lists when refresh starts:

```js
for (const path of [notesPage, clipsPage, feedsPage]) {
  const source = read(path);
  assert.match(source, /workspaceResourceKeys/);
  assert.match(source, /refreshWorkspaceResource|useWorkspaceResource/);
}
assert.doesNotMatch(read(clipsPage), /setClips\(\[\]\)[\s\S]{0,120}setIsLoading\(true\)/);
```

- [ ] **Step 2: Run the tests and confirm failure**

```bash
pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs tests/unit/feed-session-cache.test.mjs
```

Expected: FAIL because consumers still use specialized keys and Clips marks cached returns as initial loading.

- [ ] **Step 3: Migrate existing consumers without changing their UI contracts**

Use canonical keys for all list/detail reads and refreshes. Keep server-provided Notes/Clips details as cache seeds. Preserve these invariants:

```ts
const cached = getWorkspaceResource<ClipListItem[]>(workspaceResourceKeys.clipsList());
const [clips, setClips] = useState(cached?.value ?? []);
const [isLoading, setIsLoading] = useState(!cached);

// The refresh always runs, while `clips` remains populated from the cached value.
const data = await refreshWorkspaceResource(workspaceResourceKeys.clipsList(), loadClips);
setClips(data);
```

Feeds continue to cap per-feed entries at 10 through the compatibility wrapper, but aggregate feed views use their complete canonical key rather than sharing a feed-specific entry key. Sidebar feed-source reads use the same source key and in-flight refresh as the page.

On mutations, write the canonical record and invalidate `today:list` or related resources when the changed object can appear there.

- [ ] **Step 4: Run existing cache/navigation/feed tests**

```bash
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs tests/unit/feed-session-cache.test.mjs tests/unit/workspace-memory-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit existing-page alignment**

```bash
git add apps/web/src/app/'(app)'/notes/'[slug]'/NoteEditorPage.tsx apps/web/src/app/'(app)'/clips/page.tsx apps/web/src/app/'(app)'/clips/'[id]'/ClipDetailClient.tsx apps/web/src/app/'(app)'/feeds/page.tsx apps/web/src/components/shell/Sidebar.tsx tests/unit/workspace-navigation-performance.test.mjs tests/unit/feed-session-cache.test.mjs
git commit -m "refactor(cache): align existing workspace sections"
```

---

### Task 4: Slim and cache Today

**Files:**
- Modify: `apps/web/src/app/api/today/route.ts`
- Modify: `apps/web/src/app/(app)/today/page.tsx`
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`
- Create: `tests/unit/today-cache-contract.test.mjs`

- [ ] **Step 1: Write failing API and UI contract tests**

```js
test("today list omits full note clip and feed bodies", () => {
  const route = read("apps/web/src/app/api/today/route.ts");
  for (const block of route.matchAll(/select:\s*\{([\s\S]*?)\n\s*\}/g)) {
    assert.doesNotMatch(block[1], /content:\s*true/);
  }
  assert.doesNotMatch(route, /content:\s*(note|clip|entry)\.content/);
});

test("today renders cached list before background refresh and loads selected detail", () => {
  const page = read("apps/web/src/app/(app)/today/page.tsx");
  assert.match(page, /workspaceResourceKeys\.todayList/);
  assert.match(page, /useWorkspaceResource/);
  assert.match(page, /workspaceResourceKeys\.(noteDetail|clipDetail|feedEntryDetail)/);
});
```

- [ ] **Step 2: Run the new contract test and confirm failure**

```bash
pnpm exec tsx --test tests/unit/today-cache-contract.test.mjs
```

Expected: FAIL because Today returns and consumes full content and has no cache.

- [ ] **Step 3: Remove full bodies from the Today list API**

Keep card metadata and freshness fields only. The response mapping must not re-add `content`:

```ts
select: {
  id: true,
  slug: true,
  title: true,
  summary: true,
  createdAt: true,
  updatedAt: true,
  version: true,
}
```

Apply equivalent lightweight selects to Clip and FeedEntry.

- [ ] **Step 4: Add cache-first list and type-specific detail loading**

Initialize Today with `useWorkspaceResource({ key: workspaceResourceKeys.todayList(), ... })`. When selection changes, derive the detail key and URL:

```ts
function todayDetailRequest(item: TodayItem) {
  if (item.type === "note") {
    return { key: workspaceResourceKeys.noteDetail(item.id), url: `/api/notes/${item.id}` };
  }
  if (item.type === "clip") {
    return { key: workspaceResourceKeys.clipDetail(item.id), url: `/api/clips/${item.id}` };
  }
  return { key: workspaceResourceKeys.feedEntryDetail(item.id), url: `/api/feed-entries/${item.id}` };
}
```

Merge the selected detail into local/cached Today presentation without inserting body fields back into the Today list resource. Creating or editing a note updates its note detail resource and invalidates/revalidates Today list metadata.

- [ ] **Step 5: Run Today, cache, note-copy, and editor tests**

```bash
pnpm exec tsx --test tests/unit/today-cache-contract.test.mjs tests/unit/workspace-navigation-performance.test.mjs tests/unit/note-copy.test.mjs tests/unit/note-copy-ui.test.mjs
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Today migration**

```bash
git add apps/web/src/app/api/today/route.ts apps/web/src/app/'(app)'/today/page.tsx tests/unit/today-cache-contract.test.mjs tests/unit/workspace-navigation-performance.test.mjs
git commit -m "feat(cache): add cache-first today workspace"
```

---

### Task 5: Cache Trash list and details consistently

**Files:**
- Modify: `apps/web/src/app/(app)/trash/page.tsx`
- Modify: `tests/unit/trash-static.test.mjs`
- Create: `tests/unit/trash-cache-contract.test.mjs`

- [ ] **Step 1: Add failing cache and mutation assertions**

```js
test("trash keeps cached list and detail visible while refreshing", () => {
  const page = read("apps/web/src/app/(app)/trash/page.tsx");
  assert.match(page, /workspaceResourceKeys\.trashList/);
  assert.match(page, /workspaceResourceKeys\.trashDetail/);
  assert.match(page, /useWorkspaceResource/);
  assert.match(page, /invalidateWorkspaceResource/);
});
```

- [ ] **Step 2: Run the Trash tests and verify failure**

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs tests/unit/trash-cache-contract.test.mjs
```

Expected: FAIL because Trash always starts empty and fetches each selected detail directly.

- [ ] **Step 3: Migrate list/detail and mutations**

Use the shared hook for `/api/trash`. For selection, read cached detail synchronously and call `refreshWorkspaceResource(workspaceResourceKeys.trashDetail(item.type, item.id), ...)` in the background.

After restore or permanent delete:

```ts
update((current) => current.filter((entry) => itemKey(entry) !== itemKey(item)));
invalidateWorkspaceResource(workspaceResourceKeys.trashDetail(item.type, item.id));
invalidateWorkspaceResource(workspaceResourceKeys.todayList());
invalidateWorkspaceResourcePrefix("knowledge:contents:");
```

Do not clear a previously loaded detail until a new selection has neither cached nor server data.

- [ ] **Step 4: Run Trash and cache tests**

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs tests/unit/trash-cache-contract.test.mjs
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Trash migration**

```bash
git add apps/web/src/app/'(app)'/trash/page.tsx tests/unit/trash-static.test.mjs tests/unit/trash-cache-contract.test.mjs
git commit -m "feat(cache): retain trash list and details"
```

---

### Task 6: Deduplicate and slim Knowledge

**Files:**
- Modify: `packages/db/src/repositories/knowledge-bases.ts`
- Modify: `apps/web/src/app/api/knowledge-bases/[[...parts]]/route.ts`
- Modify: `apps/web/src/app/(app)/knowledge-bases/page.tsx`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `tests/unit/knowledge-api-static.test.mjs`
- Modify: `tests/unit/knowledge-ui-static.test.mjs`
- Create: `tests/unit/knowledge-cache-contract.test.mjs`
- Modify: `packages/db/src/repositories/repositories.test.ts`

- [ ] **Step 1: Add failing repository/API/cache tests**

Add repository expectations that `findContents` selects relation metadata without `content`. Add static assertions that Sidebar and the page both use `workspaceResourceKeys.knowledgeBases()` plus `refreshWorkspaceResource`, and that folder contents use `useWorkspaceResource`.

```js
assert.doesNotMatch(repository, /note:\s*true|clip:\s*true/);
assert.match(repository, /note:\s*\{\s*select:/);
assert.match(repository, /clip:\s*\{\s*select:/);
assert.match(sidebar, /workspaceResourceKeys\.knowledgeBases\(\)/);
assert.match(page, /workspaceResourceKeys\.knowledgeContents\(kbId, folderId\)/);
```

- [ ] **Step 2: Run targeted Knowledge tests and confirm failure**

```bash
pnpm exec vitest run packages/db/src/repositories/repositories.test.ts
pnpm exec tsx --test tests/unit/knowledge-api-static.test.mjs tests/unit/knowledge-ui-static.test.mjs tests/unit/knowledge-cache-contract.test.mjs
```

Expected: FAIL because the repository includes full relation records and the two consumers fetch independently.

- [ ] **Step 3: Make `findContents` return list-safe relation projections**

Use nested selects with identity, card metadata, version/freshness fields, and feed display metadata only:

```ts
select: {
  id: true,
  kind: true,
  folderId: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  note: { select: { id: true, slug: true, title: true, summary: true, version: true, createdAt: true, updatedAt: true } },
  clip: { select: { id: true, url: true, title: true, summary: true, excerpt: true, favicon: true, coverImage: true, sourceName: true, author: true, publishedAt: true, version: true, createdAt: true, updatedAt: true } },
  feedEntry: { select: { id: true, feedId: true, url: true, title: true, summary: true, excerpt: true, coverImage: true, sourceName: true, author: true, publishedAt: true, version: true, createdAt: true, updatedAt: true, feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } } },
}
```

- [ ] **Step 4: Share base/tree/contents resources between Sidebar and page**

Both consumers first read `knowledge:bases`, then call the same in-flight refresh. Default `kbId` is selected from that shared result. `openKnowledgeBase` reads/refreshes `knowledge:tree:<id>`; page folder lists read/refresh `knowledge:contents:<kbId>:<folderId>`.

Selected note/clip/feed details reuse the same detail keys and APIs used by Notes, Clips, Feeds, and Today. Asset items remain self-contained because they have no body API.

Knowledge mutations update the base/tree/contents resource that owns the changed row and invalidate dependent lists. They must not call a second uncached `reloadKnowledgeBases` path.

- [ ] **Step 5: Run Knowledge repository, API, UI, and cache tests**

```bash
pnpm exec vitest run packages/db/src/repositories/repositories.test.ts tests/unit/workspace-data-cache.test.ts tests/unit/knowledge-content.test.ts tests/unit/knowledge-tree.test.ts
pnpm exec tsx --test tests/unit/knowledge-api-static.test.mjs tests/unit/knowledge-ui-static.test.mjs tests/unit/knowledge-cache-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Knowledge migration**

```bash
git add packages/db/src/repositories/knowledge-bases.ts packages/db/src/repositories/repositories.test.ts apps/web/src/app/api/knowledge-bases/'[[...parts]]'/route.ts apps/web/src/app/'(app)'/knowledge-bases/page.tsx apps/web/src/components/shell/Sidebar.tsx tests/unit/knowledge-api-static.test.mjs tests/unit/knowledge-ui-static.test.mjs tests/unit/knowledge-cache-contract.test.mjs
git commit -m "feat(cache): deduplicate knowledge workspace data"
```

---

### Task 7: Immediate navigation feedback and timing evidence

**Files:**
- Create: `apps/web/src/lib/workspace-navigation.tsx`
- Create: `apps/web/src/components/shell/WorkspaceRouteLoading.tsx`
- Create: `apps/web/src/app/(app)/loading.tsx`
- Create: `apps/web/src/lib/server-timing.ts`
- Modify: `apps/web/src/components/shell/AppShell.tsx`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: workspace GET API routes for Notes, Clips, Feeds, Feed Entries, Today, Trash, and Knowledge
- Create: `tests/unit/workspace-navigation-feedback.test.mjs`
- Create: `tests/unit/server-timing.test.ts`

- [ ] **Step 1: Add failing pending and timing tests**

```js
test("workspace navigation exposes an immediate pending target and shared route skeleton", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const shell = read("apps/web/src/components/shell/AppShell.tsx");
  assert.ok(existsSync("apps/web/src/app/(app)/loading.tsx"));
  assert.match(sidebar, /beginNavigation/);
  assert.match(shell, /mewmo-shell--navigation-pending/);
});
```

Add a unit test for a timing builder that emits stable `auth`, `db`, and `total` metrics.

- [ ] **Step 2: Run the new tests and confirm failure**

```bash
pnpm exec tsx --test tests/unit/workspace-navigation-feedback.test.mjs
pnpm exec vitest run tests/unit/server-timing.test.ts
```

Expected: FAIL because the provider, loading boundary, and timing helper do not exist.

- [ ] **Step 3: Implement the navigation provider and route skeleton**

The provider records immediate click feedback and route commit:

```tsx
interface WorkspaceNavigationContextValue {
  pendingHref: string | null;
  beginNavigation: (href: string) => void;
}

const beginNavigation = useCallback((href: string) => {
  setPendingHref(href);
  performance.mark("mewmo:workspace-navigation:start", { detail: { href } });
}, []);

useEffect(() => {
  if (!pendingHref) return;
  performance.mark("mewmo:workspace-navigation:commit", { detail: { href: currentHref } });
  performance.measure("mewmo:workspace-navigation", "mewmo:workspace-navigation:start", "mewmo:workspace-navigation:commit");
  setPendingHref(null);
}, [currentHref, pendingHref]);
```

`SidebarLink`, feed links, knowledge-base/folder actions, and programmatic primary navigation call `beginNavigation` immediately before Link/router navigation. AppShell adds a pending class and a subtle progress indicator. `(app)/loading.tsx` returns `WorkspaceRouteLoading`, which renders the list/reader skeleton inside the existing shell main column.

- [ ] **Step 4: Add reproducible API timing headers**

Implement a helper:

```ts
export function createServerTiming() {
  const startedAt = performance.now();
  const metrics: string[] = [];
  return {
    async measure<T>(name: string, operation: () => Promise<T>) {
      const start = performance.now();
      const value = await operation();
      metrics.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
      return value;
    },
    header() {
      return [...metrics, `total;dur=${(performance.now() - startedAt).toFixed(1)}`].join(", ");
    },
  };
}
```

Wrap authentication and database/repository reads in the relevant GET routes and set `Server-Timing`. Do not change cache-control or authentication semantics.

- [ ] **Step 5: Run navigation, timing, theme, and existing static tests**

```bash
pnpm exec tsx --test tests/unit/workspace-navigation-feedback.test.mjs tests/unit/workspace-navigation-performance.test.mjs
pnpm exec vitest run tests/unit/server-timing.test.ts
pnpm test:theme
```

Expected: PASS with no new fixed theme-color violations.

- [ ] **Step 6: Commit navigation feedback and timing**

```bash
git add apps/web/src/lib/workspace-navigation.tsx apps/web/src/components/shell/WorkspaceRouteLoading.tsx apps/web/src/app/'(app)'/loading.tsx apps/web/src/lib/server-timing.ts apps/web/src/components/shell/AppShell.tsx apps/web/src/components/shell/Sidebar.tsx apps/web/src/app/globals.css apps/web/src/app/api tests/unit/workspace-navigation-feedback.test.mjs tests/unit/server-timing.test.ts
git commit -m "feat(navigation): show pending workspace transitions"
```

Before committing, stage only the explicitly modified workspace GET route files; do not stage unrelated API changes already present in another worktree.

---

### Task 8: Account-scoped current-note draft and visible save state

**Files:**
- Modify: `packages/shared/src/validators/content.ts`
- Modify: `packages/shared/src/validators/content.test.ts`
- Modify: `apps/web/src/app/api/notes/[id]/route.ts`
- Modify: `apps/web/src/components/editor/note-draft-store.ts`
- Modify: `apps/web/src/components/editor/note-draft-sync.ts`
- Modify: `apps/web/src/components/editor/NoteEditor.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `tests/unit/note-draft-store.test.ts`
- Create: `tests/unit/note-draft-sync.test.ts`
- Modify: `tests/unit/note-editor-effect-static.test.mjs`
- Modify: `tests/integration/notes-api.test.mjs`

- [ ] **Step 1: Write failing validator, API, draft, retry, and UI tests**

Extend validator tests for optional `expectedVersion` while still rejecting a payload containing no mutable field. Extend integration tests so a mismatched version returns 409 and does not overwrite content.

Draft-store tests use account-scoped keys and full data:

```ts
writeNoteDraft({
  userId: "user-1",
  noteId: "note-1",
  title: "Offline title",
  content: "Offline body",
  serverVersion: 4,
  updatedAt: 123,
}, storage);

expect(readNoteDraft("user-1", "note-1", storage)?.title).toBe("Offline title");
expect(readNoteDraft("user-2", "note-1", storage)).toBeNull();
```

Sync tests use fake timers/fetch and assert `saving → offline → saving → saved`, immediate `online` retry, HTTP rejection to `error`, exponential network retry, and an older response not clearing a newer draft.

- [ ] **Step 2: Run targeted tests and confirm failure**

```bash
pnpm exec vitest run packages/shared/src/validators/content.test.ts tests/unit/note-draft-store.test.ts tests/unit/note-draft-sync.test.ts
pnpm exec tsx --test tests/unit/note-editor-effect-static.test.mjs
```

Expected: FAIL because the draft is content-only/unscoped and no status API exists.

- [ ] **Step 3: Add optimistic concurrency to note PATCH**

Add `expectedVersion` to the validator but exclude it from the “at least one mutable field” check. Before update:

```ts
if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== note.version) {
  return NextResponse.json(
    { error: "Version conflict", currentVersion: note.version, updatedAt: note.updatedAt },
    { status: 409 },
  );
}
```

Do not change behavior for existing clients that omit `expectedVersion`.

- [ ] **Step 4: Replace the content-only draft with a full account-scoped draft**

```ts
export interface NoteDraft {
  userId: string;
  noteId: string;
  title: string;
  content: string;
  serverVersion: number;
  updatedAt: number;
}

export function noteDraftKey(userId: string, noteId: string) {
  return `mewmo:note-draft:${userId}:${noteId}`;
}
```

Return a result from local persistence so quota/serialization failure becomes visible rather than silently losing protection. Remove the legacy unscoped key after an authenticated server load; never migrate it into an account automatically.

- [ ] **Step 5: Implement the latest-draft sync coordinator**

Expose:

```ts
export type NoteSaveStatus = "saving" | "saved" | "offline" | "error";
export interface NoteSaveSnapshot { status: NoteSaveStatus; message: string; }
export function queueNoteDraftSync(draft: NoteDraft): void;
export function retryStoredNoteDraft(userId: string, noteId: string): void;
export function subscribeNoteDraftSync(userId: string, noteId: string, listener: (snapshot: NoteSaveSnapshot) => void): () => void;
```

Persist before scheduling PATCH. Only one timer/request owns a note key. Network exceptions and `navigator.onLine === false` emit `offline` and retain the draft. HTTP 409/4xx emits `error` without silent overwrite. A successful response clears only the exact draft revision it submitted and updates the coordinator's server version.

- [ ] **Step 6: Wire title/body changes and visible status into NoteEditor**

Use `useWorkspaceAccountId()`. Keep refs for latest title and content so either edit queues one full draft. Subscribe to status and render:

```tsx
<span className={`mewmo-note-save-status mewmo-note-save-status--${saveState.status}`} aria-live="polite">
  {saveState.message}
</span>
```

Messages are exactly `保存中…`, `已保存`, `离线，已保存在本机`, and `保存失败`. Register `window.addEventListener("online", retryLatestDraft)` and remove it on unmount. Preserve editor typing and existing parent `onTitleChange`/`onContentChange` callbacks.

- [ ] **Step 7: Run editor, validator, cache, API, and theme tests**

```bash
pnpm exec vitest run packages/shared/src/validators/content.test.ts tests/unit/note-draft-store.test.ts tests/unit/note-draft-sync.test.ts tests/unit/workspace-data-cache.test.ts
pnpm exec tsx --test tests/unit/note-editor-effect-static.test.mjs tests/unit/note-sharing-static.test.mjs tests/unit/note-title-slug-static.test.mjs
pnpm test:theme
```

Expected: PASS.

Run the Notes API integration suite when its harness is available:

```bash
pnpm test:integration
```

Expected: Notes create/update/version-conflict/delete cases pass; if an unrelated service prevents the full suite, record the exact failing boundary and run the smallest reproducible Notes API subset through the harness.

- [ ] **Step 8: Commit draft protection**

```bash
git add packages/shared/src/validators/content.ts packages/shared/src/validators/content.test.ts apps/web/src/app/api/notes/'[id]'/route.ts apps/web/src/components/editor/note-draft-store.ts apps/web/src/components/editor/note-draft-sync.ts apps/web/src/components/editor/NoteEditor.tsx apps/web/src/app/globals.css tests/unit/note-draft-store.test.ts tests/unit/note-draft-sync.test.ts tests/unit/note-editor-effect-static.test.mjs tests/integration/notes-api.test.mjs
git commit -m "feat(notes): expose protected offline draft state"
```

---

### Task 9: Cross-surface consistency audit and full verification

**Files:**
- Modify: `apps/web/src/lib/workspace-data-cache.ts` only if the final cross-surface test exposes a cache-contract defect.
- Modify: one or more of the six page consumers named below only when the final contract test identifies a missing shared-cache import or refresh path.
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`
- Modify: `tests/unit/workspace-memory-ui.test.mjs`
- Update: `docs/superpowers/plans/2026-07-16-workspace-cache-and-draft-status.md` checkboxes during execution.

- [ ] **Step 1: Add a final static contract covering all six surfaces**

```js
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
    assert.match(source, /refreshWorkspaceResource|useWorkspaceResource/);
  }
});
```

- [ ] **Step 2: Run the change-scoped unit and static suites**

```bash
pnpm exec vitest run tests/unit/workspace-data-cache.test.ts tests/unit/note-draft-store.test.ts tests/unit/note-draft-sync.test.ts tests/unit/knowledge-content.test.ts tests/unit/knowledge-tree.test.ts packages/db/src/repositories/repositories.test.ts packages/shared/src/validators/content.test.ts
pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs tests/unit/workspace-navigation-feedback.test.mjs tests/unit/today-cache-contract.test.mjs tests/unit/trash-cache-contract.test.mjs tests/unit/knowledge-cache-contract.test.mjs tests/unit/knowledge-api-static.test.mjs tests/unit/knowledge-ui-static.test.mjs tests/unit/trash-static.test.mjs tests/unit/feed-session-cache.test.mjs tests/unit/workspace-memory-ui.test.mjs tests/unit/note-editor-effect-static.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run repository-wide verification**

```bash
pnpm verify
```

Expected: lint, self-contained tests, theme policy, and production build pass. Do not reinterpret unrelated failures as feature success; diagnose and record them separately.

- [ ] **Step 4: Perform local browser verification**

Start the Web app through the project root and use an authenticated local account. Verify:

1. Cold and warm navigation among Notes, Clips, Feeds, Today, Trash, and Knowledge.
2. A visible pending indicator or skeleton appears within 100 ms of clicking each primary destination.
3. Warm returns retain cached lists/details while requests refresh.
4. Failed refresh retains content and displays stale/error state.
5. Sidebar and Knowledge page produce one `/api/knowledge-bases` request per concurrent refresh.
6. Today and Knowledge list responses omit `content` in DevTools Network.
7. Offline editing shows `离线，已保存在本机`; reconnect immediately retries and reaches `已保存`.
8. Switching accounts clears cached content and cannot accept the previous account's delayed response.
9. Light and dark themes keep pending, stale, and save-status UI readable.

- [ ] **Step 5: Record production timing evidence**

On `https://mewmo.vercel.app`, record click-to-pending, click-to-route-commit, `Server-Timing`, response size, and cold/warm round trips for Notes, Clips, Today, Trash, and Knowledge. Compare with the ZOO-38 baseline without claiming improvement where measurements do not show it.

- [ ] **Step 6: Inspect final changes and commit verification adjustments**

```bash
git diff --check
git status --short
git diff --stat
git add tests/unit/workspace-navigation-performance.test.mjs tests/unit/workspace-memory-ui.test.mjs docs/superpowers/plans/2026-07-16-workspace-cache-and-draft-status.md
git commit -m "test(cache): verify unified workspace behavior"
```

- [ ] **Step 7: Comment completion evidence on ZOO-38**

Add a Chinese Linear comment with root cause, files/behavior changed, exact commands and results, browser/production timings, any unverified item, risk, and commit IDs. Leave the issue `In Progress` until the user explicitly accepts the result.

---

## Definition of done

- Notes, Clips, Feeds, Today, Trash, and Knowledge use one account-scoped cache core and the same cache-first/background-refresh semantics.
- Duplicate reads share an in-flight request; account-generation changes reject delayed stale responses.
- Today and Knowledge list payloads omit full body content; selected details remain available through detail requests.
- Main workspace navigation acknowledges clicks within 100 ms and produces reproducible browser/server timing evidence.
- The current note's title/body draft is account-scoped, survives transient offline/save failure on the same device, reports visible state, retries on reconnect, and does not silently overwrite a newer server version.
- No IndexedDB, Service Worker, general offline queue, Redis response cache, weakened authentication, or public/cross-user cache is introduced.
- Targeted tests, `pnpm verify`, relevant API integration checks, and browser verification pass, with any unavailable evidence explicitly documented.
