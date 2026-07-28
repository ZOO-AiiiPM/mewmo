---
description: "Task list for 全局搜索 + 标签管理"
---

# Tasks: 全局搜索 + 标签管理

**Input**: Design documents from `/specs/001-search-tags/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件 / 无依赖）
- **[Story]**: 该 task 服务的 user story（US1 全局搜索 / US2 标签管理）
- 跨 phase 必串行；phase 内按依赖图执行

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化 + Cargo deps 切换

- [X] **T001** 改 `app/src-tauri/Cargo.toml`：移除 `tauri-plugin-sql`，加 `rusqlite = { version = "0.31", features = ["bundled"] }` + `jieba-rs = "0.7"` + `once_cell = "1"`。验收：`cargo check` 编译错误正常（lib.rs 还没改），但依赖能下载成功。**估时**: 30min

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB 后端从 sqlx 切换到 rusqlite —— 所有 user story 的前置。完成后 app 必须 CRUD 功能等价旧版。

**⚠️ CRITICAL**: Phase 2 不完成，US1 / US2 都跑不起来。本阶段对应 plan.md 的**切片 A**。

- [X] **T002** 备份现有数据库到 `~/Library/Application Support/com.vibecoding.app/vibe.db.bak`。命令：`cp ~/Library/Application\ Support/com.vibecoding.app/vibe.db ~/Library/Application\ Support/com.vibecoding.app/vibe.db.bak`。验收：备份文件存在 + sqlite3 CLI 可打开 + `SELECT count(*) FROM notes` 与现有一致。**⚠ 破坏性 migration 前置：先备份再迁移。** **估时**: 15min

- [ ] **T003** [P] 写 `app/src-tauri/src/db.rs`：rusqlite `Mutex<Connection>` + 启用 `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL` + migration 执行框架（按 `user_version` PRAGMA 顺序跑）。**估时**: 1h

- [ ] **T004** [P] 写 `app/src-tauri/src/migrations/v1_v2_v3.sql`：把现有 lib.rs 里 3 个 `Migration { version: N, sql: ... }`（notes / clips / clips metadata 列）转成 SQL 文件，由 db.rs 的 migration 框架按 user_version 执行。验收：fresh DB 启动跑完 v1/v2/v3，schema 与现有一致。**估时**: 1h

- [ ] **T005** [P] 写 `app/src-tauri/src/commands/mod.rs` + `app/src-tauri/src/commands/notes.rs` 4 个 `#[tauri::command]`：`list_notes` / `create_note` / `update_note` / `delete_note`。接口签名严格匹配 `specs/001-search-tags/contracts/notes-clips.md`。**估时**: 1.5h

- [ ] **T006** [P] 写 `app/src-tauri/src/commands/clips.rs` 4 个 `#[tauri::command]`：`list_clips` / `save_clip` / `delete_clip` / `update_clip`。接口签名严格匹配 contracts。**估时**: 1.5h

- [ ] **T007** 改 `app/src-tauri/src/lib.rs`：移除 `tauri-plugin-sql::init` 注册，加 db.rs 初始化（在 `setup` 里），用 `tauri::generate_handler![...]` 注册 8 个 commands。**估时**: 30min

- [ ] **T008** 改 `app/src/lib/db.ts`：8 个原函数（`listNotes` / `createNote` / `updateNote` / `deleteNote` / `listClips` / `saveClip` / `deleteClip` / `updateClip`）改成 `invoke<T>('cmd_name', args)`。接口签名保持 → 组件代码零改动。**估时**: 1h

- [ ] **T009** **切片 A 验收 + commit**：跑 `pnpm tauri dev` 启动正常 + 笔记 / 剪藏 CRUD 全部 work（创建 / 改 / 删 / 重启数据持久）—— quickstart.md 切片 A 验收 6 项。git commit "feat(db): 切换 SQL 后端到 rusqlite + bundled"。**估时**: 30min（含手动测试）

**Checkpoint**: Phase 2 完成 → US1 / US2 可以并行实现，但建议先 US1 后 US2（MVP 优先）。

---

## Phase 3: User Story 1 - 全局搜索 (Priority: P1) 🎯 MVP

**Goal**: 用户在 Sidebar 输入关键词，立即看到笔记 + 剪藏分组结果，bm25 排序 + 时间衰减 + 32 字 snippet 高亮 + LIKE fallback。

**Independent Test**: 在 ≥10 笔记 + ≥5 剪藏环境，搜"机器学习"看笔记排第 1，搜"AI" 短词正确命中（spec SC-001 / SC-005）。

**对应 spec**: FR-001 ~ FR-012、FR-022 ~ FR-024；SC-001 / SC-002 / SC-003 / SC-004 / SC-005

### 切片 B：jieba + FTS5 表

- [ ] **T010** [P] [US1] 写 `app/src-tauri/src/tokenizer.rs`：jieba-rs 自定义 FTS5 tokenizer（unsafe Rust ~50 行）。参考 inkdown 项目（github.com/shoushuidianfei/inkdown）的实现作 anchor。导出 `pub fn register_jieba_tokenizer(conn: &Connection) -> Result<()>`。验收：unit test 跑 `tokenize("机器学习")` 切出 ["机器", "学习"] / `tokenize("AI 笔记")` 切出 ["AI", "笔记"]。**估时**: 2h

- [ ] **T011** [P] [US1] 写 `app/src-tauri/src/migrations/v4_search_tags.sql` 的 FTS5 部分：`notes_fts` + `clips_fts` 虚表（contentless shadow，`tokenize='jieba'`）+ 6 个 FTS5 同步触发器（`notes_fts_ai/ad/au` + `clips_fts_ai/ad/au`）。**⚠ Acceptance Gate**: `notes_fts_au` / `clips_fts_au` 必须写 `AFTER UPDATE OF title, content_md, tags_text ON notes/clips`（限定列！），不能写 `AFTER UPDATE`（监听全列会让 FTS 索引损坏 —— knowledge-base v5→v6 修过这个 bug）。同时加 backfill `INSERT INTO notes_fts SELECT id, title, content_md, '' FROM notes`（tags_text 暂为空字符串，US2 会扩展）。**估时**: 1.5h

- [ ] **T012** [US1] 改 `app/src-tauri/src/db.rs`：`Connection::open` 后立即调用 `tokenizer::register_jieba_tokenizer(&conn)?`，**必须在 migration 跑之前**（migration 里 CREATE VIRTUAL TABLE 用到 jieba）。同时 migration 框架跑 v4 SQL。验收：`SELECT name FROM sqlite_master WHERE type='trigger'` 含 6 个 FTS 触发器。**估时**: 30min

- [ ] **T013** [US1] **切片 B 验收 + commit**：跑 quickstart 切片 B 验收（FTS 表 / 触发器 / backfill 完整 / jieba 命中"机器学习"）。git commit "feat(search): jieba tokenizer + FTS5 索引建立"。**估时**: 30min

### 切片 C：搜索 API + UI

- [ ] **T014** [P] [US1] 写 `app/src-tauri/src/commands/search.rs` 实现 `search_all` command。bm25 加权 `(5.0, 1.0, 3.0)` for notes、`(5.0, 1.0, 3.0, 2.0, 2.0)` for clips；时间衰减 `+ (julianday('now') - julianday(updated_at, 'unixepoch')) * 0.005`；snippet 高亮 `<mark>`；FTS5 0 行时退回 LIKE `%query%` fallback。返回类型严格匹配 `contracts/search.md`。**估时**: 2h

- [ ] **T015** [US1] 改 `app/src-tauri/src/lib.rs` 注册 `search_all` 进 `generate_handler!()`。改 `app/src/lib/db.ts` 加 `searchAll(query: string): Promise<SearchResults>` wrapper。**估时**: 30min

- [ ] **T016** [P] [US1] 写 `app/src/components/SearchResults.tsx`：分组「笔记 X 条 / 剪藏 Y 条」展示，snippet 用 `dangerouslySetInnerHTML` 渲染 `<mark>`，含 4 类 Empty State（无输入：「输入关键词，跨笔记 + 剪藏搜索」/ 0 结果：「没找到，试试更短的词」/ 加载中 / 错误）。**估时**: 2h

- [ ] **T017** [US1] 改 `app/src/components/Sidebar.tsx`：search input 接 `onChange + debounce 200ms` → 调 `searchAll`。改 `app/src/App.tsx`：搜索激活时主区域切换到 SearchResults 视图（新 tab type 或临时态）。**估时**: 1h

- [ ] **T018** [US1] **切片 C 验收 + commit**：跑 quickstart 切片 C 全部验收项（含 SC-001 短词命中 / SC-005 标题排序优先 / SC-004 端到端 ≤500ms）。git commit "feat(search): search_all + Sidebar 接入 + SearchResults 视图"。**估时**: 30min

**Checkpoint**: US1 ready 独立交付（MVP 完整）。app 已经可以全局搜索 —— 这就是 spec 的 P1 价值。

---

## Phase 4: User Story 2 - 标签管理 (Priority: P2)

**Goal**: 用户给笔记 / 剪藏挂多个标签，输入 `#` 自动补全；浏览标签云 / 标签详情视图。

**Independent Test**: 给一条笔记加 3 个标签 → TagBrowser 显示 3 个标签 + count → 点击进 TagDetailView 看到笔记。

**对应 spec**: FR-013 ~ FR-021、FR-025；SC-006 / SC-007 / SC-008

### 切片 D：标签 schema

- [ ] **T019** [P] [US2] 扩展 `app/src-tauri/src/migrations/v4_search_tags.sql`：加 `tags` / `note_tags` / `clip_tags` 三张表（按 data-model.md 完整 SQL）+ `ALTER TABLE notes / clips ADD COLUMN tags_text TEXT NOT NULL DEFAULT ''` + 4 个 tags_text 同步触发器（`note_tags_text_sync_ai/ad` + `clip_tags_text_sync_ai/ad`）。同时把 T011 的 backfill 升级为含 tags_text=''（现有数据没标签）。**估时**: 1.5h

- [ ] **T020** [P] [US2] 写 `app/src-tauri/src/commands/tags.rs` 5 个 `#[tauri::command]`：`list_tags` / `set_note_tags` / `set_clip_tags` / `rename_tag` / `delete_tag`。应用层校验：name 长度 1-50 + 不含空格。`rename_tag` 内部事务必须手动 UPDATE 受影响 notes/clips 的 tags_text（触发器只在 note_tags 增删时触发，rename 不动 note_tags）。接口严格匹配 `contracts/tags.md`。**估时**: 2h

- [ ] **T021** [US2] 改 `app/src-tauri/src/lib.rs` 注册 5 个 tags commands。改 `app/src/lib/db.ts` 加 5 个 wrapper 函数（`listTags / setNoteTags / setClipTags / renameTag / deleteTag`）。**估时**: 30min

- [ ] **T022** [US2] **切片 D 验收 + commit**：跑 quickstart 切片 D 验收（set_note_tags 后 note_tags 写入 + tags_text 同步 + notes_fts MATCH 命中标签 + rename_tag 同步 + delete_tag CASCADE 不删笔记）。git commit "feat(tags): 标签 schema + commands"。**估时**: 30min

### 切片 E：标签 UI（4 组件可并行）

- [ ] **T023** [P] [US2] 写 `app/src/components/TagPicker.tsx`：在笔记 / 剪藏编辑区域检测输入 `#` 触发，下拉显示已有标签自动补全（`list_tags` 数据），输入新词回车触发创建。验收：键盘上下选标签、回车确认、ESC 取消。**估时**: 2h

- [ ] **T024** [P] [US2] 写 `app/src/components/TagBrowser.tsx`：标签云 / 列表，每条显示 `name (note_count + clip_count)`，点击触发 `onTagSelect(tag_name)`。Empty State：标签为 0 时显示「还没标签。给笔记加 # 试试」。**估时**: 1.5h

- [ ] **T025** [P] [US2] 写 `app/src/components/TagDetailView.tsx`：某 tag 下笔记 + 剪藏混合 list（按 updated_at / saved_at 倒序）。Empty State：无内容时「该标签下还没内容」。**估时**: 1.5h

- [ ] **T026** [US2] 改 `app/src/components/NoteEditor.tsx` + `app/src/components/ClipReader.tsx`：在编辑区下方加标签栏（显示当前 tags chips + 编辑入口接 TagPicker）。改完后调 `setNoteTags` / `setClipTags` 持久化。⚠ 注意：这两个文件可能也被 US1 改过（搜索高亮等），错位执行避免冲突。**估时**: 1.5h

- [ ] **T027** [US2] 改 `app/src/components/Sidebar.tsx` 加"标签云"入口按钮（顶部导航或底部 toggle）。改 `app/src/App.tsx` 加新视图状态：点击标签云入口 → TagBrowser；点击某 tag → TagDetailView；按返回键 / ESC 退出。**估时**: 1h

- [ ] **T028** [US2] **切片 E 验收 + commit**：跑 quickstart 切片 E 验收 + Empty State 4 项 + SC-006 端到端 30 秒任务（创建标签 → 关联 → 浏览）。git commit "feat(tags): UI - picker / browser / detail view"。**估时**: 1h

**Checkpoint**: US2 ready 独立交付。

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] **T029** [P] 性能验证（SC-003 / SC-004）：mock 1k 笔记 + 500 剪藏，跑 100 次搜索测延迟。验收 99% query < 100 ms + 端到端感知 ≤ 500 ms。可在前端 `console.time` + Rust 端 `log::info!` query duration。**估时**: 1h

- [ ] **T030** [P] Empty State 全审查：搜索框无输入 / 0 结果 / 标签云空 / 标签详情空 / 笔记列表空 / 剪藏列表空 —— quickstart Empty State 段全部 + 现有 Constitution IV 检查项。任何文案不友好 / 无引导都补完。**估时**: 30min

- [ ] **T031** 清理 `vibe.db.bak`（migration 验证完毕、跑过几天确认无回滚需求才删）。**估时**: 10min

---

## Dependency Graph

```text
Phase 1 (T001 Setup)
  ↓
Phase 2 Foundational (T002 → [T003 / T004 / T005 / T006 P] → T007 → T008 → T009 commit)
  ↓
  ├─→ Phase 3 US1 切片 B ([T010 / T011 P] → T012 → T013 commit)
  │   ↓
  │   Phase 3 US1 切片 C ([T014 / T016 P] → T015 → T017 → T018 commit)
  │
  └─→ Phase 4 US2 切片 D ([T019 / T020 P] → T021 → T022 commit)
      ↓
      Phase 4 US2 切片 E ([T023 / T024 / T025 P] → T026 → T027 → T028 commit)
  ↓
Phase 5 Polish ([T029 / T030 P] → T031)
```

**关键依赖**：
- US1 / US2 在 Phase 2 完成后**理论上可并行**，但实际建议**先 US1 后 US2**（MVP 优先 + US2 的 tags_text 派生字段可参考 US1 的触发器机制）
- T019（US2 schema migration）实际是 T011（US1 FTS5 部分）的扩展：同一个 `v4_search_tags.sql` 文件。如果 US1 / US2 顺序执行，可以合并为单文件单次 commit；如果需要严格切片，T019 单独追加 v5 migration

---

## Parallel Execution Examples

**Phase 2 内部并行块（Foundational）**：
```
T003 db.rs（基础设施）
T004 migrations/v1_v2_v3.sql（独立 SQL）
T005 commands/notes.rs（不同文件）
T006 commands/clips.rs（不同文件）
```
4 task 一起做，约 1.5 h（最长那个）。然后 T007 / T008 串行。

**Phase 3 切片 B 内部并行**：
```
T010 tokenizer.rs（Rust unsafe）
T011 v4_search_tags.sql（FTS5 部分）
```
2 个并行约 2 h。

**Phase 3 切片 C 内部并行**：
```
T014 commands/search.rs（Rust）
T016 SearchResults.tsx（前端）
```
2 个并行约 2 h。

**Phase 4 切片 E 4 组件并行**：
```
T023 TagPicker.tsx
T024 TagBrowser.tsx
T025 TagDetailView.tsx
```
3 个并行约 2 h。然后 T026 / T027 串行接通。

---

## Implementation Strategy

**MVP Path** = Phase 1 + 2 + 3：仅交付 US1（全局搜索），不实施标签。3 切片即上线，约 **1 个工作日**（含验收 + commit）。

**完整 Path** = MVP + Phase 4 + 5：追加 US2（标签管理）+ Polish，再加 **半个工作日 + 测试时间**。

按 `~/.claude/rules/execution.md` 「main 永远可运行」原则，每个 commit point（**T009 / T013 / T018 / T022 / T028**）后 app 必须能 `pnpm tauri dev` 启动 + 跑通核心 CRUD。

按 execution.md 「commit ≠ 可合并」铁律，每个切片 commit 在 `001-search-tags` 分支，等用户测试关口确认才合并到 main。

---

## Format Validation

✓ 31 个 task 全部遵守 `- [ ] T### [P?] [Story?] description with file path` 格式
✓ Setup（1）/ Foundational（8）/ Polish（3）不带 [Story] label
✓ US1 phase（9 个 task）全带 `[US1]`
✓ US2 phase（10 个 task）全带 `[US2]`
✓ 每个 task 有具体文件路径（`app/src-tauri/...` / `app/src/...`）
✓ 每个 task 有粗粒度估时（10 min - 2 h）
