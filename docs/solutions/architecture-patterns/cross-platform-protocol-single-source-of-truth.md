---
title: Cross-platform protocol as a single source of truth with neutral JSON fixtures
date: 2026-08-01
category: architecture-patterns
module: sync
problem_type: architecture_pattern
component: architecture
severity: medium
applies_when:
  - A protocol (API contract) is consumed by more than one client platform
    (e.g. a Next.js web backend plus a future Apple/Swift app).
  - A monorepo has a shared-types package and a domain package that can both
    declare a "protocol", risking two divergent copies.
tags:
  - sync-protocol
  - single-source-of-truth
  - cross-platform
  - fixtures
  - dependency-cycle
  - monorepo
---

# Versioned cross-platform protocol: one authoritative package + neutral JSON fixtures

## Context

ZOO-89 asked to harden the existing note/clip/feed/feed_entry sync pull/push
contract so a future Apple (Swift) app can reuse it without depending on a
TypeScript runtime. The audit found that the canonical protocol was split across
two places that disagreed:

- `@mewmo/shared/src/types/index.ts` defined `SyncPullResponse` with a
  `nextCursor` field.
- `@mewmo/sync/src/protocol.ts` (a package nothing imported) defined a second,
  subtly different copy (`cursor` field) plus a local `normalizeCursor` helper.
- The web pull route additionally carried its own `normalizeCursor` duplicate.

There was no single authority, no contract version, no pagination/idempotency/
conflict story, and the fixtures needed by the Swift side did not exist.

## Guidance

1. **Elect one package as the protocol's single source of truth.** Put the
   contract version constant, the entity/operation lists, the request/response
   interfaces, the pure helpers, and the zod request/response validators all in
   that one package (`@mewmo/sync`). Do not duplicate the protocol anywhere.
2. **Other packages forward, not redefine.** `@mewmo/shared` re-exports the sync
   package's symbols so existing `import { syncPullSchema } from "@mewmo/shared"`
   keep compiling — but the definition lives only in `@mewmo/sync`.
3. **Avoid an import cycle.** Pick the dependency direction explicitly. Here
   `sync` is self-contained (depends only on `zod`), and `shared` depends on
   `sync`; `web` depends on both. Never let `sync` import `shared`.
4. **Expose the workspace package properly.** A package that other packages
   import must declare `main` / `types` / `exports` pointing at its source
   (`"./src/index.ts"`, mirroring `@mewmo/shared` / `@mewmo/db`), otherwise
   `next build` and `vitest` fail with "Cannot find module '@mewmo/sync'".
5. **Keep the protocol versioned and backward compatible.** `SYNC_CONTRACT_VERSION`,
   optional-if-absent fields, ignored unknown fields, and a stated
   "client newer than server is rejected" rule let both ends evolve safely.
6. **Drive testing with platform-neutral JSON fixtures.** Put `fixtures/*.json`
   in the protocol package: plain JSON that decode/conform to the contract,
   covering incremental pull, pagination, tombstones, idempotent create,
   version conflict, and error codes. Contract tests read these fixtures. The
   Swift side consumes the same JSON without any TypeScript runtime.
7. **Per-package vitest config that scopes to `src/`.** `packages/sync/vitest.config.ts`
   using `include: ["src/**/*.test.ts"]` and excluding `dist` prevents compiled
   test files from a prior `build` from being picked up by a later `turbo test`.

## Why This Matters

A protocol is a coordination contract between independently evolving consumers.
Without a single authority and neutral fixtures, each new client re-implements
its own reading, and divergences (like the `cursor` vs `nextCursor` case) surface
as hard-to-debug integration bugs. The versioned constant + fixtures give both
sides a testable, portable spec.

## When to Apply

- Introducing or hardening any cross-platform sync/migration/API contract.
- Adding a new package to a Turborepo that other packages will import.
- When a "shared types" package and a domain package could both claim a protocol.

## Examples

- `packages/sync/` owns the sync protocol (version constant, types, helpers,
  zod schemas, fixtures, contract tests).
- `packages/shared/src/sync.ts` re-exports it (no redefinition).
- `apps/web/src/app/api/sync/pull|push` import the schemas/helpers from
  `@mewmo/sync` and restore the missing `expectedVersion` optimistic-concurrency
  and idempotent-create behavior to match the contract.

## Related

- `.trellis/tasks/08-01-zoo-89-sync-contract-fixtures/` (design.md documents the
  full cursor/tombstone/version/idempotency/conflict/pagination/compatibility
  semantics).
- `.trellis/spec/architecture.md` (sync model section, updated view of Source of
  Truth).
