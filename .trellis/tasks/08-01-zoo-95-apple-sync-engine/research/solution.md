# ZOO-95 Solution Research

## Existing solution selected

The repository already supplies every external boundary required by this issue:

- ZOO-89's `packages/sync/src/fixtures` is the versioned, platform-neutral v1 wire contract. It covers incremental and paginated pull, tombstones, idempotent creates, composite mutations, and version conflicts.
- ZOO-91's `LocalStore` is actor-isolated, works entirely with Sendable snapshots, persists an opaque cursor per user, performs monotonic versioned upserts, and offers a FIFO durable outbox with exact acknowledgment.
- ZOO-93's authenticated client owns bearer acquisition and HTTP authorization. Sync should use it directly so token refresh/redaction behavior remains in one owner.

## Decision

Use an actor-local coordinator built from Foundation, SwiftData, and Network framework primitives already supplied by Apple. No external sync library, API wrapper, parallel cache, or custom protocol is warranted: all would duplicate one of the three established contract boundaries above.

## Verification source

XCTest can bundle the canonical JSON fixtures through the existing XcodeGen test resource declaration. This tests actual payload decoding rather than a second Swift fixture copy, keeping the protocol source of truth in ZOO-89.
