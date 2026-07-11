# Workspace Performance Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make note and clip navigation reuse browser-session data immediately while refreshing stale server state in the background.

**Architecture:** Add a framework-independent module-scope cache with list/detail stores, freshness checks, mutation helpers, and in-flight request deduplication. Wire notes and clips to seed, read, refresh, and mutate this cache without adding full content to list responses.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, Vitest.

---

### Task 1: Shared Workspace Data Cache

**Files:**
- Create: `apps/web/src/lib/workspace-data-cache.ts`
- Create: `tests/unit/workspace-data-cache.test.ts`

- [ ] Write tests for synchronous list/detail reads, stale detail detection, mutation helpers, and request deduplication.
- [ ] Run `pnpm exec vitest run tests/unit/workspace-data-cache.test.ts` and verify the missing module failure.
- [ ] Implement typed module-scope stores for notes and clips plus `loadOnce` in-flight deduplication.
- [ ] Re-run the targeted test and verify it passes.

### Task 2: Clip Stale-While-Revalidate Flow

**Files:**
- Modify: `apps/web/src/app/(app)/clips/page.tsx`
- Modify: `apps/web/src/components/clips/ClipContentRenderer.tsx`
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`

- [ ] Add failing static assertions that clips initialize from cache, cache detail responses, avoid refetching fresh details, and render an explicit loading state.
- [ ] Run the targeted Node test and verify the new assertions fail.
- [ ] Initialize list and selected detail from cache, refresh the list in the background, deduplicate requests, and keep cached detail on failures.
- [ ] Add a loading state distinct from confirmed empty content.
- [ ] Re-run the targeted tests and verify they pass.

### Task 3: Note Cache Integration

**Files:**
- Modify: `apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx`
- Modify: `tests/unit/workspace-navigation-performance.test.mjs`

- [ ] Add failing assertions for server-data seeding, cached selection, detail request deduplication, and cache updates after editor mutations.
- [ ] Run the targeted test and verify the new assertions fail.
- [ ] Seed the cache from server props, initialize from cached list data, reuse cached details, and update cache on create/edit/pin/delete.
- [ ] Re-run targeted cache and navigation tests.

### Task 4: Verification

**Files:**
- Verify all modified files.

- [ ] Run `pnpm exec vitest run tests/unit/workspace-data-cache.test.ts`.
- [ ] Run `pnpm exec tsx --test tests/unit/workspace-navigation-performance.test.mjs tests/unit/list-scroll-preservation.test.mjs tests/unit/note-editor-effect-static.test.mjs`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Use the running app on port 3000 to verify notes/clips section return, repeated item selection, loading state, and retained content after background refresh.
- [ ] Run `git diff --check` and inspect the final diff without staging unrelated deleted files.
