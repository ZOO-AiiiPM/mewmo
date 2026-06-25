# 正文 autosave 串写到其他 vault 文件

- **症状**：正文 autosave 改一篇笔记时，其他 vault 文件也出现同一份正文
- **根因**：后端 `update_note` 在正文保存时也会按 title 重算 slug；旧笔记 title/frontmatter/H1 不一致或碰撞时，正文 autosave 会触发 rename/refId 替换，扩大保存目标串写风险
- **修法**：`patch.title` 存在时才允许 rename；正文 autosave 走 `update_note_preserve_slug` 固定写回当前 slug；新增 Rust 测试覆盖正文保存不改名
- **关联文件**：`app/src-tauri/src/commands/notes.rs`, `app/src-tauri/src/vault/ingest.rs`
- **日期**：2026-06-01

## 踩坑记录

- **核心教训**：autosave 路径必须和 rename 路径严格分离。正文保存绝不能触发 slug 变更，否则并发写入时会把内容写到错误文件
- 修复后加了 Rust 单元测试覆盖此边界
