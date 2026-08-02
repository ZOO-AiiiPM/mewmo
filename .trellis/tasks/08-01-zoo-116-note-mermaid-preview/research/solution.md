# Mermaid Preview Research

## Repository Evidence

- Mewmo uses Milkdown Crepe 7.21.2 and already enables its CodeMirror feature through the default Crepe setup.
- Milkdown `CodeBlockConfig` exposes `renderPreview(language, content, applyPreview)`, `previewOnlyByDefault`, loading content, labels, and toggle controls.
- Milkdown's preview panel sanitizes returned strings/Elements with DOMPurify. Its 7.21.2 source specifically allows `foreignObject` only inside SVG because Mermaid v11 uses it for labels.
- Existing Mewmo CSS already styles `.preview-panel .preview-divider` and `.preview-label` with semantic theme colors.

## Candidate Comparison

### Official `mermaid-js/mermaid` - recommended

- 89,519 GitHub stars, active push on 2026-08-01, full Mermaid syntax coverage, and official browser `render`/`parse` APIs.
- Directly matches Milkdown's Mermaid-v11-aware sanitizer and client preview callback.
- Supports `startOnLoad: false` and default/explicit `securityLevel: "strict"`.
- Cost: a large runtime, mitigated by dynamic import only for Mermaid blocks.
- Source: https://github.com/mermaid-js/mermaid and https://mermaid.js.org/config/usage.html

### `remcohaszing/mermaid-isomorphic`

- 44 GitHub stars, recently maintained, wraps Mermaid for browser and Node rendering.
- Useful when SSR or unified server/browser transforms are required, but this task is an exact client-side code-block preview and Milkdown already owns insertion/sanitization.
- Adds an unnecessary wrapper and server-oriented surface.
- Source: https://github.com/remcohaszing/mermaid-isomorphic

### `lukilabs/beautiful-mermaid`

- 10,753 GitHub stars and active development, with an attractive renderer and smaller/simpler positioning.
- It is a separate renderer with different compatibility and styling behavior; the requirement is Mermaid preview compatibility, and Milkdown's current sanitizer explicitly targets Mermaid v11 output.
- Choosing it would increase syntax-compatibility and migration risk without solving a current constraint.
- Source: https://github.com/lukilabs/beautiful-mermaid

## Decision

Use the official Mermaid package locally and call `mermaid.render` through Crepe's existing `renderPreview`. Do not use `mermaid.run`, DOM-wide scanning, a CDN, remote Kroki, SSR wrappers, or a custom parser. Configure strict security, keep insertion in Milkdown's sanitizer, and lazy-load to contain bundle cost.
