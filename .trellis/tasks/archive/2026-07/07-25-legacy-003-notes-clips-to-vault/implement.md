# Tasks: 笔记 / 剪藏切到 Vault Markdown

**Input**: Design documents from `/specs/003-notes-clips-to-vault/`
**Prerequisites**: [plan.md](./plan.md) / [spec.md](./spec.md) / [research.md](./research.md) / [data-model.md](./data-model.md) / [quickstart.md](./quickstart.md)

**Tests**: Spec 显式要求 vault 写路径 + 全文搜索单元测试覆盖率 ≥ 90%（spec.md SC-013 + Assumptions），其余按 mewmo 现有惯例手工验证 + 截图。

**Organization**: 按 spec.md 3 个 user story（P1-P3）+ Phase 6 数据搬迁 + cleanup（开发动作）+ Phase 7 polish 切。

## 路径约定

- Tauri 后端 Rust：`app/src-tauri/src/`
- React 前端 TS：`app/src/`
- vibe.db migration：`app/src-tauri/migrations/`
- 一次性搬迁脚本 + e2e：`tmp/`（gitignore，不进 app bundle）

> mewmo 是 Tauri 2 桌面 App，不是 Next.js — 任何 Vercel hook 提醒（`use client` / RSC / Server Components）全部忽略（项目硬规则 [.claude/rules/ignore-vercel-hooks.md](../../.claude/rules/ignore-vercel-hooks.md)）

---

## Phase 1: Setup（Shared Infrastructure）

**Purpose**: 模块骨架 + migration 文件占位。

- [ ] T001 创建 Rust 模块骨架文件：`app/src-tauri/src/vault/ingest.rs` + `app/src-tauri/src/vault/query.rs` + `app/src-tauri/src/vault/search.rs`，每个文件先放 `// TODO Phase 003` 占位 + 在 `app/src-tauri/src/vault/mod.rs` 用 `pub mod ingest; pub mod query; pub mod search;` 引入

- [ ] T002 [P] 创建 vault-meta.db migration v3 文件 `app/src-tauri/src/vault/meta_db_migrations/v3_fts_index.sql`（按 [data-model.md §Vault FTS Index Schema](./data-model.md) 完整 SQL：`notes_fts` / `clips_fts` / `indexed_files` 表 + `idx_indexed_files_type` 索引）

- [ ] T003 [P] 创建 vibe.db migration v7 占位 `app/src-tauri/migrations/v7_drop_notes_clips.sql`（先放 `-- v7: TODO Phase 6 task` 占位，Phase 6 才填实际 DROP 语句）

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**: vault 高层 API（ingest / query / search）+ FTS index 增量更新 + 启动自愈 —— **所有 user story 的基础**。

**⚠️ CRITICAL**: 本 phase 完成前任何 user story 不能开始。

### Vault 高层 API 实装

- [ ] T004 实装 `app/src-tauri/src/vault/ingest.rs`：`write_note(vault, fm, body)` / `update_note(vault, slug, fm, body)` / `delete_note(vault, slug)` —— 内部走 spec 002 已实现 `vault::io::write_atomic`（atomic rename + mutex）+ `vault::frontmatter::serialize`（gray_matter 包装）+ slug 走 `vault::slug::generate`（中文保留 + 碰撞加序号）

- [ ] T005 [P] 实装 `app/src-tauri/src/vault/ingest.rs`：`write_clip(vault, fm, body)` / `update_clip(vault, slug, fm, body)` / `delete_clip(vault, slug)` —— 写到 `<vault>/raw/clips/<slug>.md`，frontmatter 含中文站点专属字段（cdn_url_1_1 / publish_ts / ip_location，沿用 [data-model.md §Raw Clip Schema](./data-model.md)）

- [ ] T006 [P] 实装 `app/src-tauri/src/vault/query.rs`：`list_notes(vault) -> Vec<NoteSummary>` / `get_note(vault, slug) -> NoteFull` + 同名 `_clip` 系列 —— 读 vault `wiki/notes/*.md` / `raw/clips/*.md`，解析 frontmatter（spec 002 gray_matter 包装），返回 typed struct（含 frontmatter 字段 + body）

### FTS5 索引 + 增量维护

- [ ] T007 实装 `app/src-tauri/src/vault/search.rs`：`build_index(vault)` 一次性扫所有 vault markdown 重建 FTS5 表（启动自愈用，FR-014）+ `search(vault, query) -> Vec<SearchHit>` 走 vault-meta.db FTS5 查询（沿用 mewmo `v4_search.sql` jieba 分词模式）

- [ ] T008 实装 `app/src-tauri/src/vault/meta_db.rs`：vault-meta.db 启动 `init_or_heal()` 函数：(a) 跑 migration v3 建 FTS5 表 (b) 检测 FTS 行数与 vault markdown 数量不匹配 → 调 `vault::search::build_index` 重建 (c) 在 `mewmo` 启动时（lib.rs setup）调用

- [ ] T009 实装 vault watcher → FTS 增量更新 handler：基于 spec 002 `notify-debouncer-full`，在 `app/src-tauri/src/vault/watcher.rs`（新文件或扩展现有）订阅 `wiki/notes/*.md` + `raw/clips/*.md` 改动，handler 比对 mtime 与 `indexed_files.mtime` → INSERT / UPDATE / DELETE FTS row + 更新 `indexed_files`，debounce 200ms

### Tauri command 注册（仍空实现，Phase 3+ 才切）

- [ ] T010 在 `app/src-tauri/src/lib.rs` 的 `generate_handler!` 宏内**确认现有 commands** 名签名不变（`list_notes` / `get_note` / `create_note` / `update_note` / `delete_note` / `list_clips` / `get_clip` / `save_clip` / `update_clip` / `delete_clip` / `search_all`）—— 不新增不重命名（FR-017 / FR-028）

### 单元测试

- [ ] T011 写 `app/src-tauri/src/vault/ingest.rs` 单元测试 `#[cfg(test)] mod tests`：`test_write_note_creates_md` / `test_update_note_atomic` / `test_delete_note_unlinks` / `test_slug_collision_dedup` / `test_chinese_filename_preserved` / `test_clip_chinese_fields_preserved` —— 跑 `cargo test --manifest-path app/src-tauri/Cargo.toml vault::ingest` 全过

- [ ] T012 写 `app/src-tauri/src/vault/query.rs` 单元测试：`test_list_notes_sorted_by_mtime` / `test_get_note_parses_frontmatter` / `test_list_clips_includes_chinese_fields` —— 跑 `cargo test vault::query` 全过

- [ ] T013 写 `app/src-tauri/src/vault/search.rs` 单元测试：`test_build_index_full_rebuild` / `test_search_chinese_query` / `test_search_perf_1k_under_200ms`（用 1k mock markdown 验证 SC-005）—— 跑 `cargo test vault::search` 全过

**Checkpoint**: vault 高层 API 实装 + FTS index 自愈 + 增量更新 + 单元测试 ≥ 90% 覆盖。任何 user story 现在可以开始。

---

## Phase 3: User Story 1 - 笔记 tab 切 vault（P1）🎯 MVP

**Goal**: `commands::notes::*` 实现层从 vibe.db SQLite 切到 vault markdown。Tauri command 名签名不变 → 前端 components 零改动。

**Independent Test**: mewmo 笔记 tab 新建一条笔记「测试笔记」，写正文 + 加标签 → 保存 → 退出 mewmo → `ls ~/Documents/mewmo-vault/wiki/notes/` 看到「测试笔记.md」 + cat 看到合法 frontmatter + 正文 + 标签 → Obsidian 打开 vault → 笔记可见可改 → 重启 mewmo 看到 Obsidian 改动同步。

- [ ] T014 [US1] 改 `app/src-tauri/src/commands/notes.rs::list_notes`：删除 `db.lock(); SELECT FROM notes;` 实现，改 `vault::query::list_notes(&vault_path)` —— 入参 / 返回类型保持现有 `Vec<NoteSummary>` 结构（FR-017 命令签名不变）

- [ ] T015 [P] [US1] 改 `app/src-tauri/src/commands/notes.rs::get_note(id)`：旧实现 `SELECT FROM notes WHERE id=?` 改 `vault::query::get_note(&vault_path, &id_or_slug)`（id 入参语义从「SQLite INT」过渡到「vault slug 字符串」，前端 lib/db.ts 调用方传的就是 list_notes 返回的标识符，签名兼容）

- [ ] T016 [P] [US1] 改 `app/src-tauri/src/commands/notes.rs::create_note(title, body, tags)`：旧实现 `INSERT INTO notes` 改组 frontmatter（type=user-note / created / updated / tags）+ `vault::ingest::write_note(&vault_path, fm, body)`

- [ ] T017 [US1] 改 `app/src-tauri/src/commands/notes.rs::update_note(id, ...)`：旧实现 `UPDATE notes SET ...` 改 `vault::ingest::update_note(&vault_path, &slug, fm, body)`，更新 frontmatter `updated` 字段

- [ ] T018 [US1] 改 `app/src-tauri/src/commands/notes.rs::delete_note(id)`：旧实现 `DELETE FROM notes` 改 `vault::ingest::delete_note(&vault_path, &slug)` 物理删除（dogfood 阶段不需要回收站）

- [ ] T019 [US1] **dev 实测**：跑 `pnpm tauri dev` → 笔记 tab 跑通 spec.md US1 7 个 acceptance scenarios（新建 / 编辑 / 删除 / Obsidian 同步 / list 来自 vault / 0 SQLite SQL 命中 / atomic 高频保存不损坏）→ ripgrep 扫 commands/notes.rs + lib/db.ts 笔记部分 0 命中 SQLite notes 表 SQL（SC-007）→ commit

**Checkpoint**: User Story 1 完整可独立测试，spec.md US1 7 个 acceptance scenarios 全过 + SC-001 + SC-007 满足。

---

## Phase 4: User Story 2 - 剪藏 tab 切 vault（P2）

**Goal**: `commands::clips::*` 实现层从 vibe.db SQLite 切到 vault markdown，保留中文站点专属字段（公众号 cdn_url_1_1 / 知乎 RichText / IP 属地等，FR-008）。

**Independent Test**: 剪藏一个公众号文章 → 几秒后剪藏 tab 看到 → 退出 mewmo → `ls ~/Documents/mewmo-vault/raw/clips/` 看到对应 .md → cat 看到 frontmatter 含 cdn_url_1_1 + publish_ts + 正文中文渲染正常 → Obsidian 打开 vault 看到剪藏可点链接。

- [ ] T020 [US2] 改 `app/src-tauri/src/commands/clips.rs::list_clips`：旧实现 SQLite SELECT 改 `vault::query::list_clips(&vault_path)`

- [ ] T021 [P] [US2] 改 `app/src-tauri/src/commands/clips.rs::get_clip`：改 `vault::query::get_clip(&vault_path, &slug)`

- [ ] T022 [US2] 改 `app/src-tauri/src/commands/clips.rs::save_clip(url, title, content_md, ...)`：旧实现 INSERT 改组 frontmatter（type=clip / source=web / url / site_name / saved_at / excerpt / 中文站点专属字段如 cdn_url_1_1 / publish_ts / ip_location）+ `vault::ingest::write_clip` —— **保留**现有 `clip_parser.rs`（693 行 scraper-based 中文精调）抓取逻辑不动，仅改写入路径

- [ ] T023 [P] [US2] 改 `app/src-tauri/src/commands/clips.rs::update_clip` / `delete_clip`：同 notes 模式

- [ ] T024 [US2] **dev 实测**：跑 `pnpm tauri dev` → 剪藏一个公众号 / 知乎 / 普通网页 → spec.md US2 6 个 acceptance scenarios 全过 + SC-002 中文优化字段保留率 100% → ripgrep 扫 commands/clips.rs + lib/db.ts 剪藏部分 0 命中 SQLite clips 表 SQL → commit

**Checkpoint**: User Story 2 独立可测，spec.md US2 6 个 acceptance scenarios 全过 + SC-002 满足。

---

## Phase 5: User Story 3 - 搜索切 vault index（P3）

**Goal**: `commands::search::search_all` 从 vibe.db `v4_search` FTS5 切到 vault-meta.db FTS5（笔记 / 剪藏部分），订阅 entries 搜索（如有）继续 SQLite。

**Independent Test**: 完成 US1 + US2（vault 内有真实笔记/剪藏 markdown）→ mewmo 搜索框输入笔记内容关键词 → 立即看到命中 + 高亮 + 点开看到正文（来自 vault）→ 1k 篇规模 P95 ≤ 200ms。

- [ ] T025 [US3] 改 `app/src-tauri/src/commands/search.rs::search_all(query)`：保留订阅 entries 搜索逻辑（如有），笔记 / 剪藏部分改 `vault::search::search(&vault_path, &query)` —— 返回 typed `Vec<SearchHit>` 跟现有 UI 兼容（FR-017 签名不变）

- [ ] T026 [US3] **dev 实测**：跑 `pnpm tauri dev` → 搜索 vault 笔记 / 剪藏关键词 → spec.md US3 6 个 acceptance scenarios 全过 + 1k 篇规模性能用 `time` 测 P95 ≤ 200ms（SC-005）+ 中文混合英文搜索 jieba 分词正确（FR-011）→ ripgrep 扫 commands/search.rs 0 命中 vibe.db v4_search 笔记/剪藏部分 → commit

**Checkpoint**: User Story 3 独立可测；笔记 + 剪藏 + 搜索全链路只读 vault；SC-005 性能门槛达标。

---

## Phase 6: 数据搬迁 + Cleanup（开发动作，不在 app 内）

**Purpose**: Claude 跑一次性搬迁脚本搬现有 vibe.db 笔记/剪藏数据 → vault markdown，验证后 SQL drop 老表。本 phase 是**开发动作**不是产品功能（[research.md 决策 2](./research.md)）。

- [ ] T027 写 `tmp/migrate-notes-clips-to-vault.py`（按 [data-model.md §一次性搬迁脚本](./data-model.md) 伪码扩展成完整 Python）：标准库 sqlite3 + pathlib + 第三方 PyYAML；命令行参数支持 `--vibe-db` + `--vault`；输出 stdout 报告（N 笔记 / M 剪藏 / 跳过 / 失败列表）；末尾自校验（vault `.md` 数 = vibe.db 表行数）

- [ ] T028 **手工跑搬迁**：先 `cp ~/Library/Application\ Support/com.vibecoding.app/vibe.db ~/Library/Application\ Support/com.vibecoding.app/vibe.db.dogfood-backup-$(date +%s)` 备份；然后 `python3 tmp/migrate-notes-clips-to-vault.py --vibe-db ~/Library/Application\ Support/com.vibecoding.app/vibe.db --vault ~/Documents/mewmo-vault`；验证 stdout 报告：N 笔记 + M 剪藏 + 0 跳过 + 0 失败

- [ ] T029 **dev 实测**：跑 `pnpm tauri dev` → vault watcher 自动扫新 `.md` 增量更新 FTS index → 4 tab 笔记 / 剪藏 list 数 = 旧 SQLite 表行数（SC-006 双重验证：vault `.md` 数 = vibe.db 表行数 + 抽样 5 条对比内容一致）→ Obsidian 打开 vault 看到所有笔记/剪藏 .md 渲染正常（SC-009）

- [ ] T030 写 `app/src-tauri/migrations/v7_drop_notes_clips.sql`（实际内容，覆盖 T003 占位）：`DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS clips; DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS clips_fts;`（仅 vibe.db 笔记/剪藏部分，订阅源不动）；同时在 `app/src-tauri/src/db.rs` 的 MIGRATIONS 数组 append `(7, include_str!("../migrations/v7_drop_notes_clips.sql"))`

- [ ] T031 **dev 重启验证**：`pnpm tauri dev` → migration v7 自动跑 → vibe.db 笔记/剪藏表消失 → 4 tab 全功能仍正常（**关键验证**：drop 表后 mewmo 仍能用 = vault-first 切换成功）→ commit

**Checkpoint**: 数据 100% 在 vault；SQLite 笔记/剪藏表 + FTS 全 drop；订阅源继续 SQLite；备份文件保留作历史。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: e2e 验证 + 文档同步 + journal 记录。

- [ ] T032 [P] 写 `tmp/e2e-test.sh` 跑笔记 / 剪藏 / 搜索全链路（mock LLM 响应；含 spec.md 9 个 edge cases 覆盖）

- [ ] T033 [P] 跑 `cargo test --manifest-path app/src-tauri/Cargo.toml --all` 全过（含 vault::ingest / query / search 测试 ≥ 90% 覆盖）+ `pnpm tauri dev` 完整链路实测一遍（不跳过 dev 实测，code-quality.md rule 6.1）

- [ ] T034 [P] 同步更新 `docs/02-architecture.md`（如有）+ `CLAUDE.md`（已在 plan 阶段更新 SPECKIT 段，spec 003 完成后再更新待做项）

- [ ] T035 跑完整 quickstart.md 10 步验证 → spec.md 全部 10 个 SC 实测达标 → 在 `journal.md` **顶部** prepend 「Phase 003 完成」entry（含各 user story acceptance 实测结果 / 各 SC 实测数据 / 暴露的 spec 004 follow-up），完成 spec 003 整体验收

---

## Dependencies & Execution Order

### Phase 依赖

- **Phase 1 Setup**：无依赖，可立即开始
- **Phase 2 Foundational**：依赖 Setup 完成；BLOCKS 所有 user stories
- **Phase 3-5 User Stories**：都依赖 Foundational 完成；按 P1→P2→P3 顺序进行（用户体验渐进可见）
- **Phase 6 数据搬迁 + Cleanup**：依赖 Phase 5 完成（笔记 / 剪藏 / 搜索代码路径全切 vault 后才搬数据 + drop 老表，避免半途数据丢失）
- **Phase 7 Polish**：依赖 Phase 6 完成

### User Story 间依赖

- **US1 笔记 tab 切 vault（P1）🎯 MVP**：依赖 Phase 2 完成，无其他 story 依赖；**这是 MVP**——做完它即使后续不做用户也已获得「笔记永远属于我，Obsidian 能直接打开」独立价值
- **US2 剪藏 tab 切 vault（P2）**：依赖 Phase 2，跟 US1 互不冲突可并行（不同文件 commands/notes.rs vs commands/clips.rs）
- **US3 搜索切 vault index（P3）**：依赖 Phase 2 + US1 + US2（vault 要有真实笔记/剪藏数据才能验证搜索）

### Phase 内依赖

- T001 Setup → T004-T009 Foundational 实装（先有模块文件再 fill in）
- T004 ingest → T011 单元测试；T006 query → T012 单元测试；T007/T008/T009 search/meta_db/watcher → T013 单元测试
- T014-T018 都改同一文件 commands/notes.rs，**串行**（不能 [P]）
- T020-T023 都改 commands/clips.rs，串行
- T027 搬迁脚本 → T028 跑搬迁 → T029 验证 → T030 v7 migration → T031 重启验证

### 单 user story 内并行机会

- **Phase 1 Setup**: T002 / T003 [P] 可并行
- **Phase 2 Foundational**: T005 / T006 / T011 / T012 / T013 互不冲突文件，可并行；T004 / T007 / T008 / T009 / T010 串行依赖
- **Phase 3 US1**: T015 / T016 不同函数可并行（虽同文件 commands/notes.rs，但不同函数 + 各自小修改可并发开发，最后串行 commit）
- **Phase 4 US2**: T021 / T023 [P] 同 US1 模式
- **Phase 7 Polish**: T032 / T033 / T034 全部 [P] 并行

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1 Setup（T001-T003）—— ½ 天
2. 完成 Phase 2 Foundational（T004-T013）—— **2-2.5 天**（vault 高层 API + FTS5 + watcher 集成 + 单元测试 ≥ 90% 覆盖，本 spec 最重）
3. 完成 Phase 3 US1（T014-T019）—— 1-1.5 天
4. **STOP and VALIDATE**：测试 US1 7 个 acceptance scenarios 独立通过；vault `wiki/notes/` 真有 .md + Obsidian 兼容 + ripgrep 扫 0 命中 SQLite notes 表 SQL
5. dogfood 验证：自己用 mewmo 写两条新笔记 + 编辑既存 + 删除 + 重启确认数据持久

**累计**：~3.5-4 天 = MVP 完成

### Incremental Delivery（继续推 Phase 0 完整）

5. MVP done → 加 US2 剪藏 tab（T020-T024）—— 1 天
6. 加 US3 搜索（T025-T026）—— 半天
7. 加 Phase 6 数据搬迁 + cleanup（T027-T031）—— 1 天（含手工搬迁 + 重启验证）
8. Phase 7 Polish（T032-T035）—— 半天

**累计**：~6-7 天 = spec 003 完整完成（与 plan.md 估时 5-7 天匹配）

---

## Notes

- **[P] 标记**：不同文件 + 无依赖（同文件即使不同函数也建议串行 commit，避免 merge 冲突）
- **[Story] 标签**：US1-US3 对应 spec.md 的 P1-P3；Setup / Foundational / Phase 6 / Polish 不带 Story 标签
- **测试策略**：vault 写路径 + 全文搜索强制 ≥ 90% 覆盖（T011-T013）；其他层 dev 实测 + 截图（T019 / T024 / T026 / T029 / T031 / T033）
- **dev 实测节奏**：每 user story 完成后**强制**跑 `pnpm tauri dev` 实测 + spec acceptance scenarios 验证（code-quality.md rule 6.1：cargo test pass ≠ 真实场景验证）
- **commit 节奏**：每个 user story checkpoint commit 一次（T019 / T024 / T026 / T031 / T035）
- **避免**：同文件冲突（commands/notes.rs / clips.rs / search.rs 各自串行）、跨 story 隐式依赖（US3 验收依赖 US1+US2 真实数据，但代码路径独立）
- **每个 Checkpoint** = 停下验证 user story 独立性的天然节点；spec 003 完成 = T035 + journal entry
