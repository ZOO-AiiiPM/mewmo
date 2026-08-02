# Implementation Plan

1. Add the official `mermaid` dependency to `apps/web` with pnpm so the lockfile is updated through the package manager.
2. Implement a focused Mermaid code-block preview helper covering language normalization, lazy import, one-time strict initialization, unique ids, latest-render wins, empty input, and safe error presentation.
3. Wire the helper into `Crepe.Feature.CodeMirror` in `NoteEditor.tsx`; retain all existing CodeMirror behavior and Crepe's built-in preview toggle.
4. Add semantic styles only where the current Milkdown preview styles are insufficient, including diagram overflow, SVG sizing, error state, focus-visible controls, and both themes.
5. Add focused unit tests for non-Mermaid bypass, lazy loading boundary, success, syntax failure/recovery, and stale async result suppression. Add a static integration assertion only if behavior cannot be exercised without booting the whole editor.
6. Run focused tests, Web lint, `pnpm test:theme`, Web production build, and `git diff --check`.
7. Start Web on an unoccupied port with the workspace `.env.local`. In the AO shared browser verify flowchart and sequence diagram rendering, source/preview toggle, ordinary code blocks, invalid-to-valid recovery, rapid edits, save/reopen, and dark/light themes at desktop and narrow widths.
8. Self-review the complete diff, commit scoped files plus this Trellis task, push `codex/issue-ZOO-116-note-mermaid-preview`, open one PR with title prefix `issue-116:`, and move Linear ZOO-116 to In Review only after checks pass.

## Acceptance Fix: ZOO-118

1. Set Crepe CodeMirror `previewOnlyByDefault: true`; verify non-Mermaid blocks remain source-visible because their renderer result is `null`.
2. Extend the existing scoped Mermaid preview styles to cover sanitized `foreignObject` HTML label descendants with semantic foreground color.
3. Add source/CSS contract assertions, run focused tests, lint, theme check, production build, and update the existing PR #71.

## Review Gates

- No CDN or server rendering.
- No raw `innerHTML` or weakened Mermaid security level in Mewmo code.
- No changes to note storage, API, schema, shared types, or non-note renderers.
- Bundle evidence demonstrates lazy loading rather than relying only on source inspection.
