# Feed Session Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache feed source lists and the newest 10 complete entries per opened subscription for immediate route returns.

**Architecture:** Extend the existing browser-only workspace cache with typed feed keys and capped list helpers. Initialize the feeds page from cache, refresh in the background with in-flight deduplication, and synchronize read/favorite/refresh mutations back to the cache.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Vitest, Node test runner.

---

### Task 1: Feed Cache Primitives

**Files:**
- Modify: `apps/web/src/lib/workspace-data-cache.ts`
- Modify: `tests/unit/workspace-data-cache.test.ts`

- [ ] Add failing tests for source lists keyed by type and entry lists capped at 10 newest items per feed id.
- [ ] Run the targeted Vitest file and verify the missing API failure.
- [ ] Implement feed cache getters, setters, update, and invalidation helpers.
- [ ] Re-run the targeted test and verify it passes.

### Task 2: Feed Page Stale-While-Revalidate

**Files:**
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `tests/unit/feed-session-cache.test.mjs`

- [ ] Add failing static assertions for cached initialization, request deduplication, per-feed cache writes, and mutation synchronization.
- [ ] Run the targeted Node test and verify failure.
- [ ] Initialize sources and entries from cache, preserve cached content during background refresh, and write only the newest 10 entries per source.
- [ ] Synchronize read and favorite mutations with the cache.
- [ ] Re-run the targeted test and existing feed tests.

### Task 3: Verification

**Files:**
- Verify modified cache and feed files.

- [ ] Run targeted ESLint.
- [ ] Run feed cache, feed source, feed type, navigation, and workspace cache tests.
- [ ] Run the Web build if unrelated parallel changes permit it.
- [ ] Verify the running app shows cached entries when returning to an opened subscription.
- [ ] Run `git diff --check` without staging unrelated workspace changes.
