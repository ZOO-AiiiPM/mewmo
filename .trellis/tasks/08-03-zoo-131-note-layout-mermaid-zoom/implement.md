# Implementation Plan

1. 添加 `@panzoom/panzoom` Web 依赖。
2. 包装 Mermaid SVG，并增加按需 DOM enhancer 与生命周期清理。
3. 在 `NoteEditor` 挂载 enhancer；调整阅读页与 embedded editor 的响应式宽度。
4. 扩展 Mermaid 单测，运行 Web lint、theme、build 与浏览器验收。
