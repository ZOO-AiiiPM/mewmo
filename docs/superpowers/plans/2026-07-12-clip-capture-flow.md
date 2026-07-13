# Clip Capture Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make URL capture immediate and idempotent while remote extraction runs in a retryable background job.

**Architecture:** Normalize URL identity in shared code and enforce it with a nullable Prisma unique key. Persist a queued Clip before enqueueing a BullMQ job; let an Agent worker invoke the existing secured Web extraction path, and let Clip pages own truthful async UI/cache updates.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Prisma 7, BullMQ 5, Vitest 4.

---

### Task 1: URL identity and database constraint

**Files:**
- Create: `packages/shared/src/urls.ts`
- Create: `packages/shared/src/urls.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Test: `tests/unit/clip-async-creation.test.mjs`

- [x] Write failing equivalence tests for fragments, tracking parameters, case, default ports, protocol, and trailing slashes.
- [x] Run tests and confirm failure.
- [x] Implement the normalizer and nullable unique Clip identity fields.
- [x] Generate Prisma Client and run tests until green.

### Task 2: Clip queue and persist-first API

**Files:**
- Modify: `packages/queue/src/queues.ts`
- Modify: `packages/queue/src/queues.test.ts`
- Modify: `apps/web/src/app/api/clips/route.ts`
- Test: `tests/unit/clip-async-creation.test.mjs`
- Modify: `tests/integration/clips-api.test.mjs`

- [x] Write failing tests for stable retryable Clip jobs, no synchronous extraction in create, and duplicate response metadata.
- [x] Run focused tests and confirm failure.
- [x] Implement persist-first creation, unique-conflict recovery, and queue-failure status.
- [x] Run focused and integration tests until green.

### Task 3: Background extraction worker

**Files:**
- Create: `apps/worker/src/workers/clip-worker.ts`
- Create: `apps/worker/src/workers/clip-worker.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/web/src/app/api/clips/[id]/route.ts`

- [x] Write failing worker and route contract tests for authorization, status transitions, extraction update, summary enqueue, and retry errors.
- [x] Run tests and confirm failure.
- [x] Implement the worker and secured background refresh while preserving user-triggered refresh.
- [x] Run focused tests until green.

### Task 4: Truthful submission and immediate list state

**Files:**
- Modify: `apps/web/src/components/shell/ListColumn.tsx`
- Modify: `apps/web/src/app/(app)/clips/page.tsx`
- Modify: `apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx`
- Test: `tests/unit/clip-async-creation.test.mjs`

- [x] Add failing tests for awaited submission, disabled duplicate input, truthful toast ownership, existing-record selection, and active-fetch polling.
- [x] Run focused tests and confirm failure.
- [x] Implement the async callback contract and cache/list update behavior in both Clip routes.
- [x] Run focused tests until green.

### Task 5: Batch verification and Linear handoff

- [x] Run lint, unit, theme, build, and isolated API integration suites.
- [x] Browser-test slow create, duplicate create, immediate list insertion, background status, retry, and both themes.
- [x] Record evidence on ZOO-8 and ZOO-11 while leaving them In Progress.
