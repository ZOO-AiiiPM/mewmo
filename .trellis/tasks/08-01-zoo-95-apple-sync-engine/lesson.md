# Lessons: ZOO-95 Apple SyncEngine

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `PendingMutation.payloadJSON` is an opaque canonical ZOO-89 mutation object, not only the nested `data` value. Persisted `mutationId`, `entityKind`, `op`, and `expectedVersion` are integrity metadata and must be validated before transport; invalid rows must remain queued.
- The canonical version-conflict fixture deliberately has a compact record. Applying a conflict therefore needs a full-record path plus a metadata-only fallback that preserves local fields unavailable in the fixture while advancing the server version/tombstone.
- `AuthenticatedHTTPClient` already provides the correct test seam through `NativeAuthTransport`; a second sync transport protocol would duplicate the authentication boundary.
