# 长标题不换行

- **症状**：长标题始终单行，编辑区标题不能自然换行；导入 HTML 的 heading 可能继承原文 nowrap
- **根因**：markdown 笔记标题使用 `<input>`，浏览器只能单行；HTML iframe 保留原文样式时可能带 `white-space: nowrap`
- **修法**：markdown 标题改自动增高 textarea；HTML reader 注入 heading 换行规则，只覆盖 h1-h6 的 nowrap/word break
- **关联文件**：`app/src/components/NoteEditor.tsx`, `app/src/components/HtmlReader.tsx`
- **日期**：2026-06-01
