# 知识库 HTML 笔记无法渲染、也无法导入

- **症状**：(1) 知识库 zone 里选中 HTML 笔记后，右栏用 markdown 编辑器显示源码而非 iframe 原生渲染；(2) 知识库「导入笔记」对话框里 HTML 笔记无法勾选、提示"仅支持 Markdown"
- **根因**：根本上是两个独立设计缺陷：
  1. **渲染**：KnowledgeBase.tsx 的右栏只有 `selectedClip ? <ClipReader> : selectedNote ? <NoteEditor>`，缺少 HTML 笔记的 HtmlReader 分支。对比笔记区（`App.tsx:823`）正确的三分支结构 `format==='html' ? <HtmlReader> : format==='md' ? <NoteEditor> : null`
  2. **导入**：后端 `kb_create_note` command 硬编码建 .md 格式；前端导入对话框过滤 `note.format === 'md'` 把 HTML 排除；handleImportToKb 的导入逻辑是"用 createKbNote 建 .md + 拷 content + deleteNote"，对 HTML 笔记会把源码硬塞进 .md 文件损坏格式。后端根本没有"保留格式迁移"的能力（`kb_create_note` 不支持 format 参数；library 笔记也不进 FTS；HTML 笔记在 `vault/search.rs` 就被排除了）
- **修法**（五处，跨前后端）：
  1. **KnowledgeBase.tsx 右栏**：笔记分支加 format 判断，改为 `selectedNote.format==='html' ? <HtmlReader note={selectedNote}> : <NoteEditor ...>`，对齐笔记区结构
  2. **新增 Rust command `kb_import_note`**（`app/src-tauri/src/commands/knowledge_base.rs`）：功能是把 wiki/notes 的笔记 `fs::rename` 进 library 并**保留原始扩展名**（.md/.html）。仅当源笔记为 .md 时调用 `search::delete_index_note` 清 FTS（HTML 本就不在 FTS，无需清）。允许 library 内 .html/.md 混存
  3. **注册权限**：在 `app/src-tauri/lib.rs` 的 invoke_handler 注册 `kb_import_note` command（KB zone 自定义命令，无需单独 capability 文件）
  4. **前端 wrapper**（`app/src/lib/kb.ts`）：新增 `importKbNote(noteId: string)` 方法，调用 `__TAURI__.invoke('kb_import_note', { note_id: noteId })`
  5. **KnowledgeBase.tsx 导入逻辑**：(a) 去掉对话框里 format 过滤，改为 `notes.filter(n => n.id !== selectedKbId)`（兼容 md/html）；(b) handleImportToKb 的笔记循环改为 `for (const note of selectedNotesToImport) { await importKbNote(note.id) }`，统一走新的保留格式导入逻辑（真·move 语义，与原 md 行为一致且保留原 created/updated 日期）。剪藏维持复制语义不变
- **关联文件**：
  - `app/src-tauri/src/commands/knowledge_base.rs`（新增 kb_import_note command）
  - `app/src-tauri/src/lib.rs`（invoke_handler 注册）
  - `app/src/lib/kb.ts`（importKbNote wrapper）
  - `app/src/components/KnowledgeBase.tsx`（右栏 HtmlReader 分支 + 导入过滤去掉 + handleImportToKb 循环改为 importKbNote）
- **验证**：
  - cargo test 全部通过（KB import 功能新增测试）
  - webview 直接 `window.__TAURI__.invoke('kb_import_note', { note_id: '<某HTML笔记id>' })` 验证 invoke 成功、返回新路径
  - 文件系统核对：源 wiki/notes 的目标笔记消失、target library 出现同名 .html 文件、内容完整无损
  - 前端 tsc 通过无类型错误
  - UI 流程冒烟：打开导入对话框，HTML 笔记可勾选、导入完成后右栏显示 iframe 而非源码、旧位置笔记已消失
- **日期**：2026-06-22

## 踩坑记录

- **核心教训**：导入/迁移功能涉及多格式时，后端必须支持格式参数而不是硬编码单一格式。这次的"导入只能.md"限制看似是前端过滤，根本原因是后端 command 本身就没有 format 自由度
- 「HTML 笔记无法导入」是**多层缺陷叠加**：渲染 + 导入对话框 + 后端 command + FTS 四处都做了"仅 md"的假设，任何一处修不完整都解不了。按照 mewmo 的"一个功能进多个 zone"规则（笔记 / KB / 库都要支持），新功能必须在前后端同时做完整支持，而不是某个 zone 做半截
- **验证**：改 format 相关逻辑后必须同时测 .md 和 .html 两条路径，包括导入、渲染、删除。光测 .md 看不出 HTML 的坑（FTS 不索引 HTML、HtmlReader 没接 format、导入后渲染错分支等）
