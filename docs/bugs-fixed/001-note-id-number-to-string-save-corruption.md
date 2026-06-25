# 笔记 ID 从 number 切 string 后保存错乱

- **症状**：笔记新建无法保存、内容错乱、改标题 vault 文件名不变
- **根因**：spec 003 把 note/clip ID 从 number 切到 string，但前端多处 state / history / handler 仍是 number
- **修法**：前端 ID 全链路改 string；title 变更时后端 rename vault slug 并返回新 slug；前端替换 notes/tabs/history/newlyCreatedNoteId
- **关联文件**：`app/src/App.tsx`, `app/src/components/NoteEditor.tsx`, Rust vault ingest/update
- **日期**：2026-05-29
