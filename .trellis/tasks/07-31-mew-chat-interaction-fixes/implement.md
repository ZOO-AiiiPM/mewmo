# ZOO-84 Implementation Plan

- [x] Confirm the AO worktree is on `codex/issue-ZOO-84-mew-chat-interactions`, based on the metadata-only successor of `ad543ecf`, and confirm the root checkout remains untouched.
- [x] Audit the existing A1-A5 candidate diff against `prd.md`; preserve correct code and list concrete gaps before editing.
- [x] Add focused tests for stop/send event ordering and deliberate send after the guard.
- [x] Make replacement fail closed, then test ownership, missing target, transaction suffix deletion, active leaf rollback, local transcript replacement and refresh persistence.
- [x] Restore the independent Deep Thinking toggle and carry `thinking` through shared Web types, stream/message routes and Agent runtime; test independence from Deep Insight.
- [x] Verify `/mew` Deep Insight without context and existing sidebar Deep Insight with context.
- [x] Verify hero entry animation and reduced-motion behavior without changing unrelated visual design.
- [x] Run focused tests while iterating, then run the relevant Web/Agent/DB type-check, lint and test commands available in package scripts.
- [x] Run worker self-review against every acceptance criterion and record exact evidence.
- [x] Commit only ZOO-84 files with an issue-bearing commit message, push the issue branch, and create a PR whose title contains `issue-ZOO-84`; do not merge.
- [x] Hand the PR to Codex for independent `trellis-check`. Acceptance findings become Linear sub-issues but remain in this same session/worktree/branch/PR.

Rollback point: before any edit, record the starting commit. If the candidate implementation is unsalvageable, revert only worker-owned commits in the issue worktree; never reset or clean the shared root checkout.
