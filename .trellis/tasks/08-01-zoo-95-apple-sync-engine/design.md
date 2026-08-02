# ZOO-95 Apple SyncEngine Design

## Boundaries and data flow

`App lifecycle / network recovery -> SyncEngine actor -> AuthenticatedHTTPClient -> /api/sync/{pull,push}`

`SyncEngine actor -> LocalStore actor -> SwiftData snapshots/outbox/cursor`

The app composition root creates the local store before starting a detached sync request. Reading SwiftData therefore has no dependency on authentication, reachability, or a server response.

## Engine shape

`SyncEngine` is the only coordinator and is an actor. A running boolean is the single-instance mutex: a second trigger records a diagnostic skip and returns. Its public state uses a small phase enum plus counts, last success/error, and retryability. Error descriptions are sanitized; bearer values are never stored in state or logs.

The engine accepts the existing authenticated HTTP client, a `LocalStore`, and account id. Tests use the authenticated client's native injectable transport/session path rather than adding a second API abstraction.

## Pull

For every pull page, the engine loads the account's persisted `pull` sync state, posts its cursor and contract version, decodes the stable v1 response, applies records through `LocalStore.applyPull`, then persists `nextCursor`. It repeats while `hasMore`. Saving the cursor only after applying its page makes replay idempotent under interruption. `deletedAt` travels in the normal record payload and LocalStore's monotonic upsert preserves tombstones.

## Push

The engine reads the durable FIFO outbox and sends bounded batches. `payloadJSON` is the serialized canonical ZOO-89 per-mutation wire object (`entity`, `op`, optional `id`, `data`, optional `clientMutationId`), not an Apple-specific wrapper. The durable metadata must agree: `mutationId` replaces any payload client id, `entityKind` and `op` match the decoded payload, and `expectedVersion` matches `data.expectedVersion` when the optional field is present for update/delete/mark operations. Invalid or mismatched rows fail closed: they remain queued and produce only a sanitized diagnostic. It acks only response `applied` ids. `version_conflict` applies the returned server record then acks the stale mutation; transient and unrecognised errors remain queued for a later trigger. The same stored id is reused on every retry, relying on ZOO-89's server idempotency behavior.

## Lifecycle and recovery

The composition root starts sync from a task after local setup. A foreground observer and an `NWPathMonitor` invoke the same non-blocking trigger. They do not perform I/O on the main actor. The monitor is owned by the app sync coordinator and cancelled on deinit.

## Tradeoffs and rollback

No speculative background scheduler, persistent retry counter, or custom conflict merge is introduced. A later issue can add OS background scheduling when the product needs guaranteed background execution. Reverting this change removes only the Apple sync files and composition wiring; server behavior and local data schema remain compatible.
