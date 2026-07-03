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

The first slice uses global per-user version-ish pull semantics by `updatedAt` plus entity `version`. A single monotonic global version is not implemented in this baseline, so sync responses must include `nextCursor` as an ISO timestamp and records changed after the previous cursor.

## Schema Decision

No Prisma schema change is required before worker agents start. Existing models have the required dogfood fields. Feed entries use the existing `@@unique([feedId, url])` identity for the first RSS worker pass.

## Deferred

PDF, ebook, video, podcast, full knowledge base, import/export, and proactive AI are visible only as disabled/deferred UI entries.

## Baseline Gate

- `pnpm test`: passed.
- `pnpm lint`: passed.
- `pnpm --filter @mewmo/web build`: passed with one-time local dummy env values for the required build-time environment variables. Without those overrides, local `.env.local` is missing `ANTHROPIC_API_KEY` and the build fails during page prerender env validation.
