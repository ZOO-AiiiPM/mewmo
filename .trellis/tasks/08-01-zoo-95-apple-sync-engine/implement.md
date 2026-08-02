# ZOO-95 Apple SyncEngine Implementation

## Execution order

1. Inspect ZOO-89 fixture shapes and the existing LocalStore/Auth public APIs.
2. Add focused Codable sync DTOs and an actor-isolated engine under `Sources/Sync` that owns pull, push, diagnostics, bounded retry, and mutual exclusion.
3. Add app lifecycle/reachability wiring without changing business UI or blocking cold local reads.
4. Add the Sync source/test directory to XcodeGen and document the local architecture and test gate.
5. Add fixture-driven XCTest coverage for pull, tombstone, cursor persistence, FIFO partial ack, retry/idempotency, conflict handling, canonical mutation id preservation, invalid/mismatched outbox retention, mutex, and diagnostic redaction.

## Validation

- `make -C apps/apple test`
- `make -C apps/apple verify`
- `git diff --check`

## Review gates

- No source change outside the Apple app and task artifacts.
- No API/schema/shared type changes and no token value in a source log, state field, assertion, or diagnostic.
- Cursor moves only after its records are durable; applied mutations are the only normal ack path.
- The test target consumes the canonical `packages/sync/src/fixtures` resource directory directly.

## Rollback

Revert the Apple-only commit. The server API, database schema, fixture contract, existing SwiftData models, and auth client stay unchanged.
