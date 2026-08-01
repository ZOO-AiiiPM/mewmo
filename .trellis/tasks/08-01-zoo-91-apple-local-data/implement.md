# Implementation Plan

1. Rebase on latest `origin/main`; confirm ZOO-87 and ZOO-89 files/fixtures exist.
2. Add the shared macOS unit-test target and canonical `make test` gate through XcodeGen only.
3. Define versioned V1 models and migration plan using APIs available on deployment targets.
4. Implement container factories, account isolation and actor-isolated LocalStore snapshots.
5. Implement entity CRUD/upsert/tombstone and sync-state/outbox primitives.
6. Add fixture DTO decoding from the canonical `packages/sync/src/fixtures/` resources.
7. Add focused tests for persistence, isolation, versions, tombstones, cursor, outbox and date decoding.
8. Run `make -C apps/apple test`, `make -C apps/apple verify`, the sync package tests and `git diff --check`.
9. Capture task-specific `lesson.md`, commit, push, create one ZOO-91 PR, and move Linear to In Review. Never merge.

## Risky Files and Rollback

- `apps/apple/project.yml` and `Makefile` are shared infrastructure; keep changes limited to the reusable test gate.
- Do not edit generated `Mewmo.xcodeproj`.
- Do not delete/reset a failed store. Report the error and preserve the file.

## Review Gate

- No networking, auth, image-cache or UI implementation.
- No SwiftData model crosses an actor boundary.
- Fixtures are referenced from the canonical sync package, not copied.
- All three destinations still build after the test target is added.
