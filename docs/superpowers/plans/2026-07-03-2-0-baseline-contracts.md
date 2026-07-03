# 2.0 Baseline and Shared Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the 2.0 baseline and freeze the shared API/data/sync contracts before parallel implementation starts.

**Architecture:** The control agent owns this plan. It fixes the current lint red light, audits existing schemas/repositories/routes, and writes the contract notes that UI, Content, RSS, and Sync agents must follow. Schema changes are allowed only here before worker agents start.

**Tech Stack:** Next.js 16, TypeScript 6, Prisma 7, PostgreSQL, Zod 4, Vitest, Turborepo.

---

## File Structure

- Modify `apps/web/src/components/editor/highlight-plugin.ts`: remove `any` while preserving the highlight plugin behavior.
- Modify `packages/shared/src/validators/content.ts`: add validators for clips, feed entries, and sync envelopes used by worker plans.
- Modify `packages/shared/src/types/index.ts`: add shared contract types for API responses and sync records.
- Modify `packages/db/prisma/schema.prisma`: only if contract audit proves existing fields cannot support the first dogfood slice.
- Modify `packages/db/src/repositories/repository-utils.ts`: add reusable version/tombstone helpers when the audit shows delete helpers do not increment versions.
- Modify `packages/shared/src/validators/content.test.ts` and `packages/db/src/repositories/repositories.test.ts`.
- Create `docs/superpowers/plans/2026-07-03-2-0-contract-notes.md`: concise frozen contract summary for worker agents.

## Task 1: Fix Current Lint Baseline

**Files:**
- Modify: `apps/web/src/components/editor/highlight-plugin.ts`

- [ ] **Step 1: Inspect current lint errors**

Run:

```bash
pnpm --filter @mewmo/web lint
```

Expected: FAIL with `@typescript-eslint/no-explicit-any` in `highlight-plugin.ts`.

- [ ] **Step 2: Replace untyped Markdown state values**

In `apps/web/src/components/editor/highlight-plugin.ts`, define narrow structural types above `handleMark`:

```ts
interface MarkdownPhrasingState {
  containerPhrasing(node: unknown, info: { before?: string; after?: string }): string;
}

interface RemarkProcessor {
  data(): {
    toMarkdownExtensions?: Array<{
      handlers?: Record<string, (node: unknown, parent: unknown, state: MarkdownPhrasingState, info: unknown) => string>;
    }>;
  };
}
```

Change:

```ts
function handleMark(node: unknown, _parent: unknown, state: any, info: unknown) {
```

to:

```ts
function handleMark(
  node: unknown,
  _parent: unknown,
  state: MarkdownPhrasingState,
  info: unknown,
) {
```

Change:

```ts
function (this: any) {
```

to:

```ts
function (this: RemarkProcessor) {
```

- [ ] **Step 3: Run lint and tests**

Run:

```bash
pnpm --filter @mewmo/web lint
pnpm test
```

Expected: both pass. If editor behavior changes, revert this task and use a narrower type shape.

- [ ] **Step 4: Commit baseline fix**

Run:

```bash
git add apps/web/src/components/editor/highlight-plugin.ts
git commit -m "fix(web): type highlight plugin markdown handlers"
```

## Task 2: Audit Existing Contracts

**Files:**
- Read: `packages/db/prisma/schema.prisma`
- Read: `packages/shared/src/validators/content.ts`
- Read: `packages/shared/src/types/index.ts`
- Read: `packages/db/src/repositories/*.ts`
- Read: `apps/web/src/app/api/notes/**/*.ts`
- Create: `docs/superpowers/plans/2026-07-03-2-0-contract-notes.md`

- [ ] **Step 1: Write contract notes**

Create `docs/superpowers/plans/2026-07-03-2-0-contract-notes.md` with this structure:

```md
# 2.0 Frozen Contract Notes

## Scope

These contracts apply to the first dogfood slice from `docs/superpowers/specs/2026-07-03-2-0-e-abc-sync-control.md`.

## Syncable Entities

- Note: `id`, `slug`, `title`, `content`, `summary`, `pinned`, `version`, `userId`, `createdAt`, `updatedAt`, `deletedAt`.
- Clip: `id`, `url`, `title`, `content`, `summary`, `favicon`, `version`, `userId`, `createdAt`, `updatedAt`, `deletedAt`.
- Feed: `id`, `url`, `title`, `description`, `favicon`, `refreshInterval`, `lastFetchedAt`, `version`, `userId`, `createdAt`, `updatedAt`, `deletedAt`.
- FeedEntry: `id`, `feedId`, `title`, `url`, `content`, `summary`, `author`, `publishedAt`, `readAt`, `version`, `userId`, `createdAt`, `updatedAt`, `deletedAt`.

## Ownership

Every repository and API read/write must scope by authenticated `userId`; direct lookup by only `id`, `slug`, or `url` is not allowed for user content.

## Delete

Deletes set `deletedAt` and increment `version` for syncable content.

## Sync Cursor

The first slice uses global per-user version-ish pull semantics by `updatedAt` plus entity `version`. If a single monotonic global version is not implemented, sync responses must include `nextCursor` as an ISO timestamp and records changed after the previous cursor.

## Deferred

PDF, ebook, video, podcast, full knowledge base, import/export, and proactive AI are visible only as disabled/deferred UI entries.
```

- [ ] **Step 2: Confirm no schema change is required**

Inspect `schema.prisma`. Existing models already have the required fields except feed entry GUID. For first dogfood, use `@@unique([feedId, url])` and do not add schema fields unless the RSS worker plan proves URL uniqueness is insufficient for chosen parser input.

- [ ] **Step 3: Commit contract notes**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-2-0-contract-notes.md
git commit -m "docs: freeze 2.0 dogfood contracts"
```

## Task 3: Strengthen Shared Validators

**Files:**
- Modify: `packages/shared/src/validators/content.ts`
- Modify: `packages/shared/src/validators/content.test.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Add failing validator tests**

Append tests for update clips, update feeds, feed entries, and sync envelopes:

```ts
import {
  createFeedEntrySchema,
  syncPullSchema,
  syncPushSchema,
  updateClipSchema,
  updateFeedSchema,
} from "./content";

it("requires update clips to include at least one mutable field", () => {
  expect(() => updateClipSchema.parse({})).toThrow();
  expect(updateClipSchema.parse({ title: "Saved article" }).title).toBe("Saved article");
});

it("accepts feed entry creation payloads", () => {
  const entry = createFeedEntrySchema.parse({
    feedId: "feed-1",
    title: "Article",
    url: "https://example.com/a",
    content: "Body",
  });
  expect(entry.feedId).toBe("feed-1");
});

it("validates sync pull and push envelopes", () => {
  expect(syncPullSchema.parse({ cursor: "2026-07-03T00:00:00.000Z" }).cursor).toContain("2026");
  expect(
    syncPushSchema.parse({
      mutations: [
        { entity: "note", op: "update", id: "note-1", data: { title: "A" } },
      ],
    }).mutations[0]?.entity,
  ).toBe("note");
});

it("requires update feeds to include at least one mutable field", () => {
  expect(() => updateFeedSchema.parse({})).toThrow();
  expect(updateFeedSchema.parse({ refreshInterval: 7200 }).refreshInterval).toBe(7200);
});
```

- [ ] **Step 2: Run validator tests and confirm failure**

Run:

```bash
pnpm --filter @mewmo/shared test -- --run src/validators/content.test.ts
```

Expected: FAIL because the new schemas do not exist yet.

- [ ] **Step 3: Implement validators**

Add these exports to `packages/shared/src/validators/content.ts`:

```ts
const nonEmptyUpdate = (value: Record<string, unknown>) =>
  Object.values(value).some((item) => item !== undefined);

export const updateClipSchema = z
  .object({
    url: urlSchema.optional(),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    summary: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const updateFeedSchema = z
  .object({
    url: urlSchema.optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    refreshInterval: z.number().int().positive().optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const createFeedEntrySchema = z.object({
  feedId: z.string().min(1),
  title: z.string().min(1),
  url: urlSchema,
  content: z.string(),
  summary: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
});

export const updateFeedEntrySchema = z
  .object({
    title: z.string().min(1).optional(),
    url: urlSchema.optional(),
    content: z.string().optional(),
    summary: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    publishedAt: z.coerce.date().nullable().optional(),
    readAt: z.coerce.date().nullable().optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const syncEntitySchema = z.enum(["note", "clip", "feed", "feed_entry"]);
export const syncOperationSchema = z.enum(["create", "update", "delete", "mark_read", "mark_unread"]);

export const syncMutationSchema = z.object({
  entity: syncEntitySchema,
  op: syncOperationSchema,
  id: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const syncPullSchema = z.object({
  cursor: z.string().datetime().optional(),
});

export const syncPushSchema = z.object({
  mutations: z.array(syncMutationSchema).min(1),
});
```

- [ ] **Step 4: Run shared tests**

Run:

```bash
pnpm --filter @mewmo/shared test -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit validators**

Run:

```bash
git add packages/shared/src/validators/content.ts packages/shared/src/validators/content.test.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add content and sync validators"
```

## Task 4: Final Baseline Gate

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full local gates**

Run:

```bash
pnpm test
pnpm lint
pnpm --filter @mewmo/web build
```

Expected: all pass. If the build requires local database or environment values, provide exact missing variable output in the handoff.

- [ ] **Step 2: Write baseline handoff**

Append a short note to `docs/superpowers/plans/2026-07-03-2-0-contract-notes.md`:

```md
## Baseline Gate

- `pnpm test`: passed
- `pnpm lint`: passed
- `pnpm --filter @mewmo/web build`: passed or blocked with exact reason
```

- [ ] **Step 3: Commit gate note**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-2-0-contract-notes.md
git commit -m "docs: record 2.0 baseline gate"
```
