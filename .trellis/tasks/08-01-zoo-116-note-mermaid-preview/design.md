# Technical Design

## Boundary

The integration belongs to the existing Crepe CodeMirror feature configuration in `NoteEditor`. The persisted contract remains fenced Markdown; the preview is derived client-only UI state and never enters note content, APIs, or PostgreSQL.

## Rendering Flow

1. Crepe calls `renderPreview(language, content, applyPreview)` when code or language changes.
2. A small local renderer normalizes the language. Non-Mermaid or empty content returns `null` synchronously.
3. Mermaid content starts a generation token, dynamically imports the official `mermaid` module, and initializes it once with `startOnLoad: false` and `securityLevel: "strict"`.
4. The renderer calls `mermaid.render` with a collision-free id and the current source.
5. Only the latest generation may call `applyPreview`; stale success and error results are discarded.
6. Success returns SVG text to Crepe. Crepe's existing preview panel sanitizes and inserts it.
7. Failure applies a local error element/string with no raw exception HTML and no unhandled rejection. A later valid edit replaces the error.

## Module Shape

- Keep Mermaid-specific loading, initialization, id generation, race control, and error formatting in a focused editor helper/module rather than expanding `NoteEditor.tsx`.
- `NoteEditor.tsx` only wires the renderer into `featureConfigs[Crepe.Feature.CodeMirror]` and supplies localized/static preview labels if required by existing UI conventions.
- Do not fork Milkdown components or reach into private Vue node-view state.

## Security

- Keep Mermaid `securityLevel: "strict"`; do not enable `loose`, `antiscript`, click handlers, or arbitrary HTML labels.
- Do not use `dangerouslySetInnerHTML` in Mewmo code. SVG insertion remains owned by Milkdown's DOMPurify-backed preview panel.
- User-visible errors must be rendered as text, not interpolated HTML.

## Performance And Concurrency

- Dynamic import ensures the Mermaid runtime is absent from the initial no-diagram path. Do not use a CDN because domestic delivery must be deterministic and offline-compatible.
- Cache the import/initialization promise per browser runtime.
- Use monotonically increasing generations or an equivalent latest-request contract. Mermaid render does not need to be forcibly canceled, but stale results must not update the preview.
- Avoid a global DOM scan (`mermaid.run`) because Crepe already provides exact block content; call `mermaid.render` directly.

## Theme And Compatibility

- Prefer Mermaid theme variables derived from current semantic colors or a neutral base that is verified in both application themes.
- Theme changes must trigger a correct preview on the currently mounted editor; do not require a page reload.
- Preserve existing fenced Markdown and Milkdown serialization so old notes remain compatible and removing the feature is a UI-only rollback.

## Rollback

Remove the CodeMirror `renderPreview` configuration, Mermaid helper, dependency, styles, and tests. Stored notes need no migration because their Markdown is unchanged.
