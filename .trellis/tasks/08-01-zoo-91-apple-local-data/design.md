# Design

## Architecture

- `Sources/Data/Models/`: `MewmoSchemaV1` and six persisted model families.
- `Sources/Data/MewmoMigrationPlan.swift`: V1-first `SchemaMigrationPlan`, initially no artificial stage.
- `Sources/Data/LocalDataContainer.swift`: in-memory/test and per-account disk container factories.
- `Sources/Data/LocalStore.swift`: actor-isolated repositories and Sendable snapshots.
- `Tests/Data/`: repository, persistence, isolation, migration-entry and fixture decoding tests.

## Data Boundaries

PostgreSQL remains authoritative. SwiftData stores full pull records needed by the client plus local sync metadata. Cursor stays opaque. Pending mutations are durable envelopes only; ZOO-95 owns transport, retries and conflict decisions.

Models must not use cascade relationships between Feed and FeedEntry because tombstones arrive per entity. Image fields remain source URL strings and are consumed by ZOO-92 later.

## Concurrency

One model actor owns each container context. Public APIs accept and return Sendable DTO/snapshot values. UI and later SyncEngine code never receive live SwiftData model instances across actor boundaries.

## Version and Deletion Rules

- incoming version lower than local: ignore/reject without rollback;
- equal version: idempotent no-op unless byte-equivalent normalization is required;
- higher version: update the stored snapshot;
- deletedAt marks a tombstone; default fetch excludes it, explicit sync/debug fetch includes it.

## Test Infrastructure Ownership

ZOO-91 owns the first shared macOS unit-test target and canonical `make test` command in `project.yml`/`Makefile`. Later Issues append source-specific tests to this target. Generated `.xcodeproj` remains ignored and is never hand-edited.

## Compatibility and Failure

- Use APIs available on iOS 17/macOS 14; avoid newer-only schema macros.
- Decode ISO-8601 timestamps with and without fractional seconds.
- Ignore unknown response fields for forward compatibility.
- Container opening errors propagate; there is no automatic destructive recovery.

## Risks

- Pull fixtures do not enumerate every business field. Cross-check Prisma models and pull route before finalizing DTOs.
- SwiftData model objects are not Sendable under Swift 6 strict concurrency. Enforce actor + snapshots at the API boundary.
- Concurrent work on project/test configuration would conflict. ZOO-92/93 start after this PR merges.
