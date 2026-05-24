# Quickstart: 验证搜索 + 标签

按 plan.md 的 5 个 implementation slices 顺序验收。每片完成后跑对应清单。

## 切片 A 验收（DB 后端切换完）

- [ ] `pnpm tauri dev` 启动正常，无 panic / migration error
- [ ] 创建笔记、写正文、保存 → 列表显示
- [ ] 删除笔记 → 列表更新
- [ ] 粘贴 URL 创建剪藏 → 显示
- [ ] 重启 app → 数据持久（migration 没丢现有数据）
- [ ] `~/Library/Application Support/com.vibecoding.app/vibe.db` 可用 sqlite3 CLI 打开

## 切片 B 验收（jieba + FTS5 表）

- [ ] `SELECT sqlite_version()` ≥ 3.34（rusqlite bundled）
- [ ] `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts%'` → notes_fts + clips_fts
- [ ] 触发器都存在：`SELECT name FROM sqlite_master WHERE type='trigger'` 含 notes_fts_ai/ad/au + clips_fts_ai/ad/au + note_tags_text_sync_ai/ad + clip_tags_text_sync_ai/ad
- [ ] backfill 完整：`SELECT count(*) FROM notes_fts` = `SELECT count(*) FROM notes`
- [ ] 改一条笔记标题 → 用 sqlite3 CLI 查 notes_fts，索引已更新
- [ ] jieba 分词验证：CLI 跑 `SELECT * FROM notes_fts WHERE notes_fts MATCH '机器学习'` 命中含此词的笔记

## 切片 C 验收（搜索 API + UI）

- [ ] Sidebar 输入"机器学习"，结果出现含此词的笔记 + 剪藏，分组「笔记 X 条 / 剪藏 Y 条」
- [ ] 输入"AI"（≤ 2 字短词）→ 命中含 AI 的笔记（**SC-001 关键验证**）
- [ ] 输入"日本"、"会议"、"读书" → 短词都正确命中
- [ ] 输入"少数派"→ 命中该站点剪藏
- [ ] 输入"ChatGPT 笔记"（中英混合）→ 命中
- [ ] 命中关键词在结果里有 `<mark>` 高亮（用 dangerouslySetInnerHTML 渲染）
- [ ] 32 字 snippet 可见
- [ ] 标题命中的笔记排在仅正文命中的笔记之前（**SC-005 验证**）
- [ ] 输入空白 / 0 字符 → 显示"输入关键词"提示，不卡死
- [ ] 输入不存在的词 → "没找到，试试更短的词"
- [ ] 1k 笔记 + 500 剪藏数据下，输入到看结果 ≤ 500ms（含 debounce 200ms + render，**SC-004 验证**）
- [ ] 单次搜索 SQL query ≤ 100ms（**SC-003 验证**，可用 EXPLAIN QUERY PLAN 或 logging 确认）

## 切片 D 验收（标签 schema）

- [ ] 调 `set_note_tags(noteId, ['项目', '机器学习'])` → DB 里 note_tags 有 2 行
- [ ] notes.tags_text = "项目 机器学习"
- [ ] notes_fts MATCH '项目' 命中此笔记
- [ ] 重复调 `set_note_tags(noteId, ['项目'])` → note_tags 只剩 1 行（'机器学习' 关联被删）
- [ ] tags 表里 '机器学习' 仍存在（标签本身不删）
- [ ] 调 `rename_tag('项目', 'projects')` → notes.tags_text 同步成 "projects"
- [ ] 调 `delete_tag('projects')` → tags 表删一行 + CASCADE 清 note_tags + notes.tags_text 重算

## 切片 E 验收（标签 UI）

- [ ] NoteEditor 输入 `#` 触发标签 picker，下拉显示已有标签
- [ ] 选中已有标签 → 关联，标签栏可见
- [ ] 输入新标签名回车 → 新建并关联
- [ ] Sidebar 加"标签云"入口，点击进入 TagBrowser
- [ ] TagBrowser 显示所有标签 + count（"项目(5)" 这种）
- [ ] 点击标签 → 看到该标签下所有笔记 + 剪藏混合 list（TagDetailView）
- [ ] 改标签名 → 所有关联内容显示新名（FR-019）
- [ ] 删除标签 → 标签消失，笔记 / 剪藏保留（FR-020）
- [ ] 笔记 / 剪藏被删除时，note_tags / clip_tags 自动清除（CASCADE，FR-025）

## Empty State 验收（Constitution IV）

- [ ] 搜索框未输入 → "输入关键词，跨笔记 + 剪藏搜索"
- [ ] 搜索 0 结果 → "没找到，试试更短的词"
- [ ] 标签云为空 → "还没标签。给笔记加 # 试试"
- [ ] 标签详情无内容 → "该标签下还没内容"

## 性能验收（SC-003 / SC-004）

- [ ] 万级笔记规模下，初次启动 backfill ≤ 3s
- [ ] 单次搜索 query ≤ 50ms（不含 debounce / render）
- [ ] 端到端用户感知 ≤ 500ms

## 端到端任务时长验收（SC-006）

新用户 30 秒内完成下面流程，完成率 ≥ 95%：

1. 打开 app
2. 创建一条笔记
3. 输入 `#` 给笔记加 1 个新标签
4. 点击侧栏标签云
5. 点击该标签 → 看到该笔记
