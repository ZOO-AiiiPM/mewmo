# Feed Creation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make feed discovery keyboard-safe and multi-select while persisting feeds before idempotent asynchronous first fetches.

**Architecture:** Keep discovery and batch orchestration in the existing feed page, make the API persist then enqueue through `@mewmo/queue`, and make the existing Agent feed worker own observable fetch state and entry-level failure isolation. Reuse the existing Feed status columns and Web cache loaders.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Prisma 7, BullMQ 5, Vitest 4, Node test runner.

---

### Task 1: Queue contract and persist-before-fetch API

**Files:**
- Modify: `packages/queue/src/queues.ts`
- Modify: `packages/queue/src/queues.test.ts`
- Modify: `apps/web/src/app/api/feeds/[[...parts]]/route.ts`
- Test: `tests/unit/feed-async-creation.test.mjs`

- [ ] Write failing queue and route contract tests proving a stable feed job id, retries, and no synchronous `fetchAndStoreFeed` call in feed creation.
- [ ] Run the focused tests and confirm they fail for the missing async contract.
- [ ] Add default feed job options and change create/duplicate/refresh paths to persist status and enqueue.
- [ ] Run focused tests until green.

### Task 2: Worker progress and entry isolation

**Files:**
- Modify: `apps/agent/src/workers/feed-worker.test.ts`
- Modify: `apps/agent/src/workers/feed-worker.ts`

- [ ] Add failing tests for fetching status, success status, partial entry failure, and terminal feed failure.
- [ ] Run Agent worker tests and confirm expected failures.
- [ ] Implement status transitions and per-entry isolation without changing unrelated workers.
- [ ] Run Agent worker tests until green.

### Task 3: Feed status presentation and polling

**Files:**
- Modify: `apps/web/src/lib/feed-status.test.ts`
- Modify: `apps/web/src/lib/feed-status.ts`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Test: `tests/unit/feed-async-creation.test.mjs`

- [ ] Add failing tests for queued/fetching/partial copy, retry availability, and bounded active-sync polling.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement status copy and poll only while the selected Feed is active.
- [ ] Run focused tests until green.

### Task 4: Enter submission and batch selection

**Files:**
- Create: `apps/web/src/lib/feed-add-selection.ts`
- Create: `apps/web/src/lib/feed-add-selection.test.ts`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `tests/unit/feed-source-menu.test.mjs`

- [ ] Add failing unit tests for selection toggles, select-all, failed-only retry selection, and exact Enter/IME form behavior.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the pure selection helpers, checkbox result UI, per-source outcomes, and explicit `requestSubmit()` keyboard handling.
- [ ] Run focused tests until green.

### Task 5: Batch verification and Linear handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-12-feed-creation-flow.md` only to check completed steps.

- [ ] Run feed-focused unit tests, Agent tests, API integration tests, lint, theme check, and build.
- [ ] Reproduce Enter, multi-select, async status, retry, and partial-result behavior in the browser in both themes.
- [ ] Record evidence and implementation summary on ZOO-9, ZOO-10, and ZOO-12 while leaving all three In Progress.
