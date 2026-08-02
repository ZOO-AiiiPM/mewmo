# Lessons: ZOO-116 笔记 Mermaid 代码块预览

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- Acceptance found that Mermaid's base theme emits HTML labels inside sanitized SVG `foreignObject` nodes. Styling only SVG `text` and `.label` selectors does not cover those descendants, so dark-theme labels can retain Mermaid's dark inline foreground.
- Crepe's native `previewOnlyByDefault` applies safely here: its component hides CodeMirror only when `preview.value` is truthy, while non-Mermaid renderers return `null` and remain source-visible.
- Crepe 7.21.2 still focuses CodeMirror when a preview-only code-block node is selected. Because the host is only hidden with CSS, ordinary Enter can mutate invisible source instead of leaving the block; default preview mode therefore needs an explicit hidden-host keyboard bridge to ProseMirror's `exitCode`.
- Before IntersectionObserver initializes the code-block node view, Crepe renders a `<pre><code>` placeholder. Its child `code` inherits the inline-code error/accent color and can flash during note switches; hiding the placeholder visually while retaining its box prevents both the color flash and layout shift.
- Preview-only node views make keyboard-only whole-block deletion hard to discover. Reusing the existing block menu and a normal history-tracked ProseMirror delete transaction provides a direct action without adding confirmation state or a second control surface.
