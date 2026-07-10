# New Account Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every new account three truthful onboarding notes while removing all implicit prototype knowledge-base, folder, clip, and asset creation.

**Architecture:** Put onboarding note definitions and idempotent creation in `@mewmo/db` so credentials registration, Auth.js events, and the cleanup script share one contract. Make the knowledge-base GET route a pure repository read. Add a dry-run-first cleanup script with fixed legacy fingerprints, then verify the current account through the running app.

**Tech Stack:** TypeScript 6, Prisma 7, Next.js 16 App Router, Auth.js 5, Vitest, Node test runner.

---

### Task 1: Shared onboarding note initialization

**Files:**
- Create: `packages/db/src/onboarding.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/onboarding.test.ts`

- [ ] Write failing tests that assert the exact three stable slugs, the pinned first note, and idempotent `findUnique`/`create` behavior.
- [ ] Run `pnpm exec vitest run packages/db/src/onboarding.test.ts` and verify the missing module failure.
- [ ] Add `ONBOARDING_NOTES` and `ensureOnboardingNotes(client, userId)` using the smallest Prisma-compatible client interface.
- [ ] Export the helper from `@mewmo/db` and re-run the targeted test.

### Task 2: Account creation integration

**Files:**
- Modify: `apps/web/src/app/api/register/route.ts`
- Modify: `packages/auth/src/auth.ts`
- Modify: `packages/auth/src/auth.test.ts`
- Modify: `tests/unit/auth-ui-static.test.mjs`

- [ ] Add failing assertions that credentials registration calls onboarding initialization inside `$transaction`, Auth.js handles `createUser`, and registration redirects through a callback to the first onboarding slug.
- [ ] Run the targeted Vitest and Node tests and confirm the new assertions fail.
- [ ] Wrap credentials user creation and onboarding notes in one Prisma transaction.
- [ ] Add an Auth.js `events.createUser` handler that calls the same idempotent helper.
- [ ] Return the first-note path from registration and preserve it through the login callback URL.
- [ ] Re-run the targeted tests.

### Task 3: Remove implicit prototype creation

**Files:**
- Modify: `apps/web/src/app/api/knowledge-bases/[[...parts]]/route.ts`
- Modify: `tests/unit/knowledge-api-static.test.mjs`

- [ ] Replace prototype-seeding assertions with failing assertions that the route contains no prototype constants or seeding helpers.
- [ ] Run `pnpm exec tsx --test tests/unit/knowledge-api-static.test.mjs` and confirm it fails against the existing seed code.
- [ ] Delete prototype type definitions, constants, seed helpers, and unused note/clip repository imports.
- [ ] Make root GET return `repo.findByUserId(userId)` directly and re-run the test.

### Task 4: Safe legacy cleanup command

**Files:**
- Create: `packages/db/src/cleanup-prototype-onboarding.ts`
- Create: `packages/db/src/cleanup-prototype-onboarding.test.ts`
- Create: `packages/db/scripts/cleanup-prototype-onboarding.ts`
- Modify: `package.json`

- [ ] Write failing tests for exact note/clip fingerprints, knowledge-base fingerprint qualification, dry-run behavior, apply behavior, and onboarding-note backfill.
- [ ] Run the targeted test and verify the missing module failure.
- [ ] Implement a client-injected cleanup function that reports matched/deleted/backfilled counts and mutates only when `apply` is true.
- [ ] Add a CLI that loads the configured Prisma client, prints the report, disconnects cleanly, and requires `--apply` for writes.
- [ ] Add root scripts `onboarding:cleanup` and `onboarding:cleanup:apply`.
- [ ] Re-run the cleanup unit test, run the dry run against the configured database, inspect the report, then run apply once.

### Task 5: Verification on the current workspace

**Files:**
- Verify all modified files.

- [ ] Run the onboarding, auth, and knowledge API targeted tests.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build` with the existing local environment.
- [ ] Authenticate against port 3000 and verify `/api/notes` contains the three onboarding notes while `/api/clips` and `/api/knowledge-bases` contain no matched prototype data.
- [ ] Open `/notes` in the in-app browser and verify the three-note list, first-note selection, readable content, and no prototype knowledge-base entries.
- [ ] Run `git diff --check` and inspect the final diff without staging unrelated existing work.
