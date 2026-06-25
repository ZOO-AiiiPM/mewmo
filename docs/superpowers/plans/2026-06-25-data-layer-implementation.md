# Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 2.0 data layer packages: Prisma schema, repositories, shared validation, Auth.js config, BullMQ queues, R2 storage, and Resend email helpers.

**Architecture:** `packages/db` owns the database schema, Prisma client, and user-scoped repositories. `packages/shared` owns environment validation and shared Zod schemas. `packages/auth`, `packages/queue`, `packages/storage`, and `packages/email` stay thin wrappers over their external services so downstream web and agent packages can import stable helpers.

**Tech Stack:** TypeScript 6, Prisma 7, PostgreSQL, Vitest, Zod, Auth.js v5, BullMQ, AWS SDK S3 client, Resend.

---

## File Structure

- Modify `packages/db/prisma/schema.prisma`: all business tables plus Auth.js adapter tables.
- Create `packages/db/src/client.ts`: singleton Prisma client export.
- Create `packages/db/src/repositories/*.ts`: focused CRUD modules for notes, clips, feeds, feed entries, AI chats, and tags.
- Create `packages/db/src/repositories/repository-utils.ts`: shared user/deleted filters and version bump helpers.
- Create `packages/db/src/repositories/*.test.ts`: repository behavior tests using mocked Prisma delegates.
- Modify `packages/db/src/index.ts`: export client and repositories.
- Modify `packages/shared/package.json`: add Zod dependency and real test script.
- Create `packages/shared/src/env.ts`: environment validation.
- Create `packages/shared/src/validators/*.ts`: create/update schemas.
- Create `packages/shared/src/types/*.ts`: shared entity/job/storage/email types.
- Create `packages/shared/src/*.test.ts`: env and validator tests.
- Modify `packages/auth/package.json`: add Auth.js and Prisma adapter dependencies.
- Create `packages/auth/src/auth.ts`, `packages/auth/src/middleware.ts`: Auth.js config and route guard export.
- Modify `packages/queue/package.json`: add BullMQ and ioredis.
- Create `packages/queue/src/client.ts`, `packages/queue/src/queues.ts`, `packages/queue/src/jobs.ts`: queue definitions and add helpers.
- Modify `packages/storage/package.json`: add AWS SDK dependency.
- Create `packages/storage/src/client.ts`, `packages/storage/src/storage.ts`: R2/S3 helpers.
- Modify `packages/email/package.json`: add Resend dependency.
- Create `packages/email/src/client.ts`, `packages/email/src/messages.ts`: email helpers.

## Task 1: Shared Validation Foundation

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/src/env.ts`
- Create: `packages/shared/src/validators/content.ts`
- Create: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/env.test.ts`, `packages/shared/src/validators/content.test.ts`

- [ ] **Step 1: Write failing env tests**

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("returns validated env values", () => {
    const env = loadEnv({
      DATABASE_URL: "postgresql://mewmo:mewmo@localhost:5432/mewmo_dev",
      REDIS_URL: "redis://localhost:6379",
      NEXTAUTH_SECRET: "secret",
      NEXTAUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      OPENAI_API_KEY: "openai",
      ANTHROPIC_API_KEY: "anthropic",
      R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      R2_ACCESS_KEY: "access",
      R2_SECRET_KEY: "secret",
      R2_BUCKET: "mewmo-dev",
      RESEND_API_KEY: "resend",
      EMAIL_FROM: "Mewmo <login@mewmo.app>",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.R2_BUCKET).toBe("mewmo-dev");
  });

  it("throws when required env values are missing", () => {
    expect(() => loadEnv({})).toThrow("Invalid environment");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mewmo/shared test -- --run src/env.test.ts`

Expected: FAIL because `./env` does not exist or `test` script is still a placeholder.

- [ ] **Step 3: Implement minimal env loader and package script**

Implement `loadEnv(input = process.env)` with Zod and export it from `src/index.ts`. Change package `test` script to `vitest`.

- [ ] **Step 4: Write failing validator tests**

```ts
import { describe, expect, it } from "vitest";
import { createNoteSchema, updateNoteSchema, createClipSchema, createFeedSchema } from "./content";

describe("content validators", () => {
  it("accepts valid note input", () => {
    expect(createNoteSchema.parse({ slug: "hello", title: "Hello", content: "Body" }).title).toBe("Hello");
  });

  it("requires valid feed urls", () => {
    expect(() => createFeedSchema.parse({ url: "not-a-url", title: "Bad" })).toThrow();
  });

  it("requires update notes to include at least one mutable field", () => {
    expect(() => updateNoteSchema.parse({})).toThrow();
  });

  it("accepts clips with optional metadata", () => {
    expect(createClipSchema.parse({ url: "https://example.com/a", title: "A", content: "" }).url).toContain("https://");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @mewmo/shared test -- --run src/validators/content.test.ts`

Expected: FAIL because validator exports do not exist.

- [ ] **Step 6: Implement validators and shared types**

Create schemas for create/update note, clip, feed, tag, AI chat, queue job payloads, storage operations, and email payloads. Export inferred types.

- [ ] **Step 7: Run shared tests**

Run: `pnpm --filter @mewmo/shared test -- --run`

Expected: PASS.

## Task 2: Prisma Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/package.json`
- Create: `packages/db/src/client.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write schema**

Define models for users, notes, clips, feeds, feed entries, AI chats, AI messages, tags, taggables, tag pool, sync cursors, accounts, sessions, verification tokens, and authenticators. Use `String @id @default(cuid())`, `createdAt`, `updatedAt`, soft-delete fields where specified, `version Int @default(1)` on syncable business content, and user-scoped indexes.

- [ ] **Step 2: Generate Prisma client**

Run: `pnpm --filter @mewmo/db db:generate`

Expected: Prisma Client generation succeeds.

- [ ] **Step 3: Add client export**

Create a singleton `prisma` client and export `Prisma`, `PrismaClient`, and repository modules.

## Task 3: Repository Layer

**Files:**
- Create: `packages/db/src/repositories/repository-utils.ts`
- Create: `packages/db/src/repositories/notes.ts`
- Create: `packages/db/src/repositories/clips.ts`
- Create: `packages/db/src/repositories/feeds.ts`
- Create: `packages/db/src/repositories/feed-entries.ts`
- Create: `packages/db/src/repositories/ai-chats.ts`
- Create: `packages/db/src/repositories/tags.ts`
- Create: `packages/db/src/repositories/repositories.test.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write failing repository tests**

Test against fake delegates that record Prisma calls. Cover: notes find by user includes `userId` and `deletedAt: null`; delete uses soft delete and increments version; feed due refresh filters by refresh interval; mark as read sets `readAt`; attach/detach tags require a `userId`-scoped tag lookup.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mewmo/db test -- --run src/repositories/repositories.test.ts`

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement repository modules**

Each repository accepts an optional Prisma-like client parameter for tests and defaults to the singleton `prisma`. All user-owned queries include `userId`; list/read queries exclude `deletedAt`; delete operations set `deletedAt` instead of hard delete. `search` uses PostgreSQL text search through `$queryRaw` with user and soft-delete predicates.

- [ ] **Step 4: Run repository tests**

Run: `pnpm --filter @mewmo/db test -- --run`

Expected: PASS.

## Task 4: Auth Package

**Files:**
- Modify: `packages/auth/package.json`
- Create: `packages/auth/src/auth.ts`
- Create: `packages/auth/src/middleware.ts`
- Modify: `packages/auth/src/index.ts`
- Test: `packages/auth/src/auth.test.ts`

- [ ] **Step 1: Write failing Auth config test**

Verify that `authConfig.providers` includes email and Google providers and that protected routes match `/app/:path*`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mewmo/auth test -- --run`

Expected: FAIL because config exports do not exist.

- [ ] **Step 3: Implement Auth.js config**

Use `NextAuth`, `PrismaAdapter(prisma)`, Resend email delivery for magic links, Google provider, and middleware matcher for `/app/:path*`.

- [ ] **Step 4: Run auth tests**

Run: `pnpm --filter @mewmo/auth test -- --run`

Expected: PASS.

## Task 5: Queue Package

**Files:**
- Modify: `packages/queue/package.json`
- Create: `packages/queue/src/client.ts`
- Create: `packages/queue/src/queues.ts`
- Create: `packages/queue/src/jobs.ts`
- Modify: `packages/queue/src/index.ts`
- Test: `packages/queue/src/queues.test.ts`

- [ ] **Step 1: Write failing queue tests**

Verify the four queue names are stable and `addJob` forwards payloads to the requested queue with optional job options.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mewmo/queue test -- --run`

Expected: FAIL because queue exports do not exist.

- [ ] **Step 3: Implement BullMQ helpers**

Use `REDIS_URL` from shared env. Export `tagQueue`, `summaryQueue`, `feedFetchQueue`, `embeddingQueue`, plus typed `addTagJob`, `addSummaryJob`, `addFeedFetchJob`, `addEmbeddingJob`.

- [ ] **Step 4: Run queue tests**

Run: `pnpm --filter @mewmo/queue test -- --run`

Expected: PASS.

## Task 6: Storage and Email Packages

**Files:**
- Modify: `packages/storage/package.json`
- Create: `packages/storage/src/client.ts`
- Create: `packages/storage/src/storage.ts`
- Modify: `packages/storage/src/index.ts`
- Test: `packages/storage/src/storage.test.ts`
- Modify: `packages/email/package.json`
- Create: `packages/email/src/client.ts`
- Create: `packages/email/src/messages.ts`
- Modify: `packages/email/src/index.ts`
- Test: `packages/email/src/messages.test.ts`

- [ ] **Step 1: Write failing storage tests**

Verify `getUrl("a/b.png")` returns a stable public URL when `R2_PUBLIC_BASE_URL` is configured and that upload/delete call S3 commands with the expected bucket and key.

- [ ] **Step 2: Run storage test to verify it fails**

Run: `pnpm --filter @mewmo/storage test -- --run`

Expected: FAIL because storage exports do not exist.

- [ ] **Step 3: Implement R2 storage**

Create S3 client configured for Cloudflare R2. Implement `upload(file, path)`, `getUrl(path)`, and `deleteObject(path)`.

- [ ] **Step 4: Write failing email tests**

Verify verification and reset emails pass recipient, subject, and token link to a provided Resend-like client.

- [ ] **Step 5: Run email test to verify it fails**

Run: `pnpm --filter @mewmo/email test -- --run`

Expected: FAIL because email exports do not exist.

- [ ] **Step 6: Implement Resend email helpers**

Create `sendVerification(email, token)` and `sendPasswordReset(email, token)` using shared env values.

- [ ] **Step 7: Run storage and email tests**

Run: `pnpm --filter @mewmo/storage test -- --run && pnpm --filter @mewmo/email test -- --run`

Expected: PASS.

## Task 7: Final Verification

**Files:**
- All changed data-layer files.

- [ ] **Step 1: Generate Prisma client**

Run: `pnpm db:generate`

Expected: PASS.

- [ ] **Step 2: Run package tests**

Run: `pnpm --filter @mewmo/shared test -- --run && pnpm --filter @mewmo/db test -- --run && pnpm --filter @mewmo/auth test -- --run && pnpm --filter @mewmo/queue test -- --run && pnpm --filter @mewmo/storage test -- --run && pnpm --filter @mewmo/email test -- --run`

Expected: PASS.

- [ ] **Step 3: Run type/lint checks**

Run: `pnpm --filter @mewmo/shared build && pnpm --filter @mewmo/db build && pnpm --filter @mewmo/auth build && pnpm --filter @mewmo/queue build && pnpm --filter @mewmo/storage build && pnpm --filter @mewmo/email build`

Expected: PASS.

- [ ] **Step 4: Optional database push**

Run only when local Docker Postgres is available: `pnpm db:push`

Expected: PASS.

## Self-Review

- Spec coverage: The plan covers all Agent 2 packages and deliverables from `docs/03-agent-tasks.md`.
- Placeholder scan: No `TBD`, `TODO`, or "implement later" placeholders remain.
- Type consistency: Queue, storage, email, and repository helpers are exported through package `src/index.ts` files for downstream packages.
