# Implementation Plan

1. Rebase the Issue branch on the latest `origin/main` and verify ZOO-87/88/89 are present.
2. Audit shell and theme sources; record exact layout/token anchors in `research/`.
3. Audit notes, clips, feeds/feed entries and their state branches.
4. Define the grayscale-only light palette and the Apple-only top tab state model, including the resolved restoration behavior.
5. Write `.trellis/spec/apple/mac-ui.md` using the mapping and state-matrix structure from `design.md`.
6. Add the minimal Apple spec index/link without changing unrelated specs.
7. Mechanically verify every referenced path/component/token against `origin/main`.
8. Run Markdown/style checks available in the repo plus `git diff --check`.
9. Capture task-specific `lesson.md`, commit, push, create one ZOO-90 PR, and move Linear to In Review. Never merge.

## Review Gate

- Diff contains documentation/spec only.
- No SwiftUI or Web product code changes.
- No AI behavior is included in the Apple v1 target.
- Light mode contains no warm-yellow/beige token, and tabs are labeled Apple enhancement rather than Web parity.
- Tab restoration is account-scoped, tolerant of invalid/deleted targets, and cleared on logout/account switch.
- Every normative rule is either source-backed or clearly labeled as macOS-native mapping.
