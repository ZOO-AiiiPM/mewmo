# Lessons: ZOO-116 笔记 Mermaid 代码块预览

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- Acceptance found that Mermaid's base theme emits HTML labels inside sanitized SVG `foreignObject` nodes. Styling only SVG `text` and `.label` selectors does not cover those descendants, so dark-theme labels can retain Mermaid's dark inline foreground.
- Crepe's native `previewOnlyByDefault` applies safely here: its component hides CodeMirror only when `preview.value` is truthy, while non-Mermaid renderers return `null` and remain source-visible.
