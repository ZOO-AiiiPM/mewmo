# Sync Contract Fixtures

Platform-neutral sample payloads for the mewmo sync protocol (ZOO-89). They are
**plain JSON only** — no TypeScript runtime is required, so the Swift (Apple)
client can bundle and consume them directly as test fixtures / decoding examples.

## Contract

- `contractVersion: 1` — single major version. Same-major requests are backward
  compatible; unknown fields are ignored; clients newer than the server are
  rejected with `contract_version_unsupported` (HTTP 426). Missing `contractVersion`
  defaults to 1.
- Entities: `note`, `clip`, `feed`, `feed_entry`.
- Operations: `create`, `update`, `delete`, `mark_read`, `mark_unread`.
- Every syncable record carries `{ id, version, createdAt, updatedAt, deletedAt, userId }`.
- The pull `cursor`/`nextCursor` is a **composite keyset cursor**
  (`mewmo-sync-v1:<json>`): one `(updatedAt, id)` position per entity. `id` is the
  stable tie-breaker so rows sharing an `updatedAt` are never skipped or
  duplicated across pages. A missing cursor starts a full sync; a legacy plain
  ISO timestamp resumes every entity from that time.

## Semantics covered by each fixture

| File | Covers |
|------|--------|
| `pull-incremental.json` | Incremental pull: records with `updatedAt > cursor`, server returns a new `nextCursor`. |
| `pull-pagination.json` | Pagination: `limit` + `hasMore`, second page resumes from `nextCursor`. |
| `pull-tombstones.json` | Soft-delete tombstones stream over pull via `deletedAt`. |
| `push-create-idempotent.json` | Re-pushing the same client `id` does not create a duplicate. |
| `push-update-conflict.json` | `expectedVersion` mismatch → `version_conflict` + current record echoed. |
| `push-mutations-composite.json` | One push batches create/update/delete/mark_read. |
| `push-errors.json` | Per-mutation error codes (`not_found`, `missing_id`, `unsupported_entity`, `unsupported_operation`). |

## Consuming from Swift

- Decode the `expectedResponse` / `request` / `applied` / `errors` JSON keys with
  your model `Codable` structs. The top-level shape is stable within contract v1.
- Use `pull-incremental.json` to drive a `SyncPullResponse` decoder test and
  `push-create-idempotent.json` / `push-update-conflict.json` to drive push
  request/response decoders and conflict handling.
