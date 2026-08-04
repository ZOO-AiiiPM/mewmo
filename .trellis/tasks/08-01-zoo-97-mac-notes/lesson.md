# Lessons: 实现 Mac 笔记功能

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `LocalStore` already owns account filtering, tombstones and durable FIFO outbox; notes UI must call it instead of duplicating persistence or sync state. [file:apps/apple/Sources/Data/LocalStore.swift:26]
- `SyncEngine` resolves a server version conflict by landing the authoritative record and acking the stale mutation. UI must persist/display a local conflict copy before that acknowledgement to avoid invisible loss. [file:apps/apple/Sources/Sync/SyncEngine.swift:288]
- This machine has an unrelated `/Applications/mewmo.app` with the same display name. Native visual acceptance must build with a temporary DerivedData path and unique `PRODUCT_BUNDLE_IDENTIFIER`, then activate and capture by the worktree executable's exact PID; application-name automation is invalid evidence. [user correction]
- Delivery read-back: Linear transitioned from In Progress to In Review at 2026-08-02 14:11:40 Beijing time; PR #77 at `12033815` passed ci, gitleaks, Vercel, and Vercel Preview Comments. Keep the PR open without approval, merge, or deployment. [orchestrator confirmation]
