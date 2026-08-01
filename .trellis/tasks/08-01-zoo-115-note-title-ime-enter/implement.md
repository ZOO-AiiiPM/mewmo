# Implementation Plan

1. Update the pure title key decision in `apps/web/src/components/editor/title-ui.ts` to accept the complete IME-relevant event shape and return `allow` for active composition or key code 229.
2. Pass `e.key`, `e.nativeEvent.isComposing`, and the compatible key code from `NoteEditor.handleTitleKeyDown`; only prevent default, commit, and focus the body for `commit-and-focus-body`.
3. Expand `tests/unit/editor-title-ui.test.ts` for active composition, key code 229, ordinary Enter, and non-Enter keys.
4. Run the focused test, Web lint/build checks relevant to the touched files, and `git diff --check`.
5. Start Web on an unoccupied port with the workspace `.env.local`; verify real Chromium pinyin composition and ordinary Enter behavior.
6. Self-review the diff, commit only scoped files plus this Trellis task, push `codex/issue-ZOO-115-note-title-ime-enter`, open one PR with title prefix `issue-115:`, and move Linear ZOO-115 to In Review only after checks pass.

## Rollback Point

The change is isolated to the title event predicate, its caller, and tests. If browser behavior regresses, revert those scoped changes without altering title persistence or sync code.

