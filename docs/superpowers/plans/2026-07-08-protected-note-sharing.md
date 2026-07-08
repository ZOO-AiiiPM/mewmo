# Protected Note Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add login-gated note sharing links with read-only shared note pages.

**Architecture:** Store shares in a `NoteShare` table keyed by a random token. The owner-facing share action calls a note-specific API to create or reuse the token. `/share/notes/[token]` is protected by middleware and renders the shared note read-only for any logged-in user.

**Tech Stack:** Next.js App Router, Next middleware, Prisma 7, React client components, Node test runner, Vitest where repository behavior needs TypeScript execution.

---

### Task 1: Red Tests

**Files:**
- Create: `tests/unit/note-sharing-static.test.mjs`

- [ ] **Step 1: Write static tests for model, routes, auth callback, and UI wiring**

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("protected note sharing has data model routes auth callback and note UI wiring", () => {
  assert.match(read("packages/db/prisma/schema.prisma"), /model NoteShare \{/);
  assert.match(read("apps/web/src/middleware.ts"), /"\/share\/:path\*"/);
  assert.ok(existsSync("apps/web/src/app/api/notes/[id]/share/route.ts"));
  assert.ok(existsSync("apps/web/src/app/share/notes/[token]/page.tsx"));
  assert.match(read("apps/web/src/app/(auth)/login/page.tsx"), /callbackUrl/);
  assert.match(read("apps/web/src/app/(auth)/register/page.tsx"), /callbackUrl/);
  assert.match(read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx"), /shareNote/);
});
```

- [ ] **Step 2: Run the red test**

Run: `pnpm exec tsx --test tests/unit/note-sharing-static.test.mjs`

Expected: FAIL because `NoteShare`, share API route, share page, callback handling, and `shareNote` are missing.

### Task 2: Data Model and API

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/repositories/note-shares.ts`
- Create: `apps/web/src/app/api/notes/[id]/share/route.ts`

- [ ] **Step 1: Add `NoteShare` relation and repository**

Add a Prisma model with `token @unique`, indexes for `noteId/revokedAt` and `ownerId/revokedAt`, and relations to `Note` and `User`. Add `createNoteSharesRepository()` with `createOrReuse(ownerId, noteId, tokenFactory)`.

- [ ] **Step 2: Add authenticated share route**

Create `POST /api/notes/[id]/share`. It checks `auth()`, verifies the note belongs to the session user and is not deleted, creates/reuses an active share, and returns `{ token, url: "/share/notes/<token>" }`.

- [ ] **Step 3: Run targeted tests**

Run: `pnpm exec tsx --test tests/unit/note-sharing-static.test.mjs`

Expected: FAIL only on callback/UI/page checks until the remaining tasks are implemented.

### Task 3: Protected Shared Page and Auth Callback

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/app/share/notes/[token]/page.tsx`

- [ ] **Step 1: Protect `/share/:path*`**

Add `/share/:path*` to the middleware matcher so unauthenticated visitors redirect to login with `callbackUrl`.

- [ ] **Step 2: Preserve callback URL through login/register**

Login reads `callbackUrl` from `useSearchParams()` and redirects there after credentials login. Register reads `callbackUrl` and routes to `/login?callbackUrl=<same-value>` after successful registration.

- [ ] **Step 3: Render read-only shared note**

The page uses `auth()` as a server-side guard, looks up active share by token, returns `notFound()` for missing/revoked/deleted notes, and renders title, updated time, owner label, and markdown text in a read-only document.

### Task 4: Owner UI Wiring

**Files:**
- Modify: `apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx`

- [ ] **Step 1: Replace placeholder share toast**

Add `shareNote(item)` that calls `/api/notes/${item.id}/share`, copies `new URL(data.url, window.location.origin).toString()`, and shows success/error toast.

- [ ] **Step 2: Wire both note share entry points**

Pass `onShare={() => void shareNote(item)}` in note list card menus and `onShare={selectedNote ? () => void shareNote(currentToolbarNote) : undefined}` in the reader toolbar.

### Task 5: Verification

- [ ] **Step 1: Run targeted red/green test**

Run: `pnpm exec tsx --test tests/unit/note-sharing-static.test.mjs`

Expected: PASS.

- [ ] **Step 2: Generate Prisma client**

Run: `pnpm --filter @mewmo/db db:generate`

Expected: Prisma client generation succeeds.

- [ ] **Step 3: Run full verification**

Run: `pnpm test`, `pnpm lint`, `pnpm build`, and `git diff --check`.

Expected: all commands exit 0.
