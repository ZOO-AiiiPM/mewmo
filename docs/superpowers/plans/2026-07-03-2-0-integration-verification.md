# 2.0 Integration and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate UI, Notes/Clips, RSS, and Sync workstreams into one dogfood-ready 2.0 slice with clear verification evidence.

**Architecture:** The control agent owns integration. It reviews worker commits, resolves conflicts, removes hidden mock paths from primary flows, runs full gates, performs browser smoke checks, and writes the handoff. It does not add major new features during integration.

**Tech Stack:** Turborepo, Next.js, Prisma/PostgreSQL, Redis/BullMQ, browser smoke testing.

---

## File Structure

- Read worker summaries and commits.
- Modify only files needed to resolve conflicts or connect seams between completed workstreams.
- Create `docs/superpowers/handoff/2026-07-03-2-0-e-abc-sync-handoff.md`.

## Task 1: Review Worker Outputs

**Files:**
- Read: worker summaries.
- Read: `git log --oneline -20`.
- Read: `git status --short`.

- [ ] **Step 1: Confirm working tree**

Run:

```bash
pwd
git branch --show-current
git status --short --branch
```

Expected: path is `/Users/zoo/zoo/CC工作目录/进行中/mewmo/worktree/2.0`; branch is `2.0`.

- [ ] **Step 2: Review changed files**

Run:

```bash
git diff --stat origin/2.0...HEAD
```

If `origin/2.0` is not the correct base for local work, use the baseline commit recorded before implementation.

- [ ] **Step 3: Check boundaries**

Confirm:

- UI Agent did not edit Prisma/worker/sync internals.
- Content Agent did not rewrite RSS/Sync.
- RSS Agent did not change unrelated UI shell behavior.
- Sync Agent did not create a second data model.

## Task 2: Remove Hidden Mock Primary Paths

**Files:**
- Inspect: `apps/web/src/app/(app)/**`
- Inspect: `apps/web/src/lib/mock-data.ts`

- [ ] **Step 1: Search mock imports**

Run:

```bash
rg -n "mock-data|generateNotes|generateClips|generateFeeds|generateFeedEntries" apps/web/src/app apps/web/src/components
```

Expected: no mock imports in primary Notes, Clips, Feeds, Feed Entries, Home recent, or Today flows. Mock data may remain only in explicitly deferred AI/demo surfaces.

- [ ] **Step 2: Fix accidental mock usage**

Replace mock imports with API fetches or server-side authenticated DB reads. If a surface is deferred, disable its navigation or label it as not connected.

## Task 3: Full Verification Gates

**Files:**
- No planned edits.

- [ ] **Step 1: Run tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS. If blocked by missing env or unavailable services, record exact output and run the narrowest meaningful package builds.

## Task 4: Browser and Worker Smoke Checks

**Files:**
- No planned edits unless smoke checks reveal integration bugs.

- [ ] **Step 1: Start local services**

Run:

```bash
docker compose -f docker/docker-compose.yml up -d
pnpm db:push
pnpm dev
```

Expected: web starts on localhost:3000 and agent starts without crashing.

- [ ] **Step 2: Browser flows**

Check:

- register/login or use existing test user
- create note, edit content, refresh, content persists
- create clip, open clip reader, delete clip
- add feed, fetch or enqueue fetch, view entries if fetch succeeds
- mark feed entry read/unread
- sync pull returns records
- sync push creates and deletes a note
- theme switch light/dark/system remains readable
- deferred PDF/Books/Video/Podcast do not navigate to fake pages

- [ ] **Step 3: Worker smoke**

Trigger one feed fetch job through the API or queue helper. Verify running it twice does not duplicate entries for the same feed URL.

## Task 5: Handoff Document

**Files:**
- Create: `docs/superpowers/handoff/2026-07-03-2-0-e-abc-sync-handoff.md`

- [ ] **Step 1: Write handoff**

Use:

```md
# 2.0 E-ABC + Sync Handoff

## Completed

- UI:
- Notes:
- Clips:
- RSS:
- Sync:

## Verification

- `pnpm test`:
- `pnpm lint`:
- `pnpm build`:
- Browser smoke:
- Worker smoke:

## Remaining Dogfood Gaps

- 

## Deferred Product Areas

- PDF:
- Books:
- Video:
- Podcast:
- Knowledge Base:
- Import/export:
- Proactive AI:

## Known Bugs

- 
```

If there are no known bugs, write `None found in this verification pass.` under Known Bugs.

- [ ] **Step 2: Commit handoff**

Run:

```bash
git add docs/superpowers/handoff/2026-07-03-2-0-e-abc-sync-handoff.md
git commit -m "docs: hand off 2.0 dogfood verification"
```

