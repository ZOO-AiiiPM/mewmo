# Quickstart: 笔记 / 剪藏切到 Vault Markdown

> 开发者从零跑通本 spec 的步骤指南。前置：[spec 002 vault-wiki-foundation](../002-vault-wiki-foundation/) 已落地（vault 骨架 + Layer 1 IO + 5 persona）。

**预计耗时**：5-7 天（按 user story P1→P2→P3 顺序）

## 前置环境

- 当前已在 `feature/vault-wiki` 分支 + `002-foundation` worktree
- vault 已初始化在 `~/Documents/mewmo-vault/`（spec 002 完成）
- `pnpm tauri dev` 当前能启动 + 旧 4 tab 正常（spec 002 验证过）
- vibe.db 含一些笔记 / 剪藏数据（dogfood 现状）

## Step 1：实装 vault 高层 API（半天）

新建 3 个 Rust 模块，每个 ≤ 200 行：

- `app/src-tauri/src/vault/ingest.rs`：`write_note(vault, fm, body)` / `update_note(vault, slug, fm, body)` / `delete_note(vault, slug)` + 同名 `_clip` 系列。内部全用 [vault::io](../../app/src-tauri/src/vault/io.rs)（spec 002 已实现 atomic write + mutex + frontmatter 序列化）
- `app/src-tauri/src/vault/query.rs`：`list_notes(vault) -> Vec<NoteSummary>` / `get_note(vault, slug) -> NoteFull` + 同名 `_clip` 系列。读 `<vault>/wiki/notes/*.md` 解析 frontmatter（spec 002 `gray_matter` 包装）
- `app/src-tauri/src/vault/search.rs`：`search(vault, query) -> Vec<SearchHit>` 走 `<vault>/.mewmo/vault-meta.db` FTS5；`build_index(vault)` 一次性扫所有 markdown 重建 FTS（启动自愈用）

写完跑 `cargo test --manifest-path app/src-tauri/Cargo.toml vault::ingest vault::query vault::search` 验证。

## Step 2：vault-meta.db FTS5 schema migration（半天）

按 [data-model.md `Vault FTS Index Schema`](./data-model.md) 写 `<vault>/.mewmo/vault-meta.db` migration v3：

- 加 `notes_fts` / `clips_fts` FTS5 虚拟表 + `indexed_files` 元数据表
- 沿用 mewmo `v4_search.sql` 的 jieba tokenizer 注册模式（[现有 db.rs](../../app/src-tauri/src/db.rs) 看注册逻辑）
- 启动自愈：`vault/meta_db.rs` 的 `init_or_heal()` 函数检测 FTS 不存在 / 行数 mismatch → 调 `vault::search::build_index`

跑 `cargo test vault::meta_db` + dev 启动看 vault-meta.db FTS 表创建成功。

## Step 3：增量 watcher 接入 FTS（半天）

复用 spec 002 的 `notify-debouncer-full` watcher（已订阅 vault 改动事件），新增 handler：

- 监听 `<vault>/wiki/notes/*.md` + `<vault>/raw/clips/*.md` 改动
- 对每个改动事件：比对文件 mtime 与 `indexed_files.mtime` → INSERT / UPDATE / DELETE FTS row
- debounce 200ms（避免 NoteEditor 自动保存触发频繁）

dev 实测：手动用 `echo "..." > <vault>/wiki/notes/test.md` → 2s 内 FTS 表新增 row（SC-006 ≤ 2s）。

## Step 4：US1 笔记 tab 切 vault（1.5 天）

改 `app/src-tauri/src/commands/notes.rs`：每个 Tauri command 内部完全替换实现（[research.md 决策 3](./research.md) 实施模式表）。**Tauri command 名签名不变**——前端 `lib/db.ts` 笔记部分零改动。

| Tauri command | 旧实现 | 新实现 |
|---|---|---|
| `list_notes` | `db.query("SELECT FROM notes")` | `vault::query::list_notes(&vault)` |
| `get_note(id)` | `SELECT WHERE id=?` | `vault::query::get_note(&vault, &slug)` |
| `create_note(title, body, tags)` | `INSERT INTO notes` | `vault::ingest::write_note(&vault, fm, body)` |
| `update_note` | `UPDATE notes SET ...` | `vault::ingest::update_note(...)` |
| `delete_note` | `DELETE FROM notes` | `vault::ingest::delete_note(...)` |

注意：`get_note(id)` 的 `id` 入参从「SQLite 自增 INT」语义切到「vault slug 字符串」语义。前端 `lib/db.ts` 调用方传的就是从 list_notes 返回的标识符，签名兼容（`id: string`）。

dev 实测（spec FR-026 main 永远可运行）：
1. mewmo 笔记 tab 新建笔记「测试」→ vault `wiki/notes/测试.md` 出现
2. 编辑保存 → atomic 更新 + frontmatter `updated` 字段刷新
3. 删除 → vault `.md` 物理删除
4. Obsidian 打开 vault 看到笔记 + frontmatter 渲染正常
5. 在 Obsidian 改保存 → 切回 mewmo 看到改动同步

✅ US1 acceptance scenarios 1-7 全过 → commit。

## Step 5：US2 剪藏 tab 切 vault（1 天）

同 Step 4 模式改 `app/src-tauri/src/commands/clips.rs`，注意：

- 剪藏抓取继续走现有 `clip_parser.rs`（693 行中文站点精调，**不重构**）
- frontmatter 必须保留中文优化字段（公众号 `cdn_url_1_1` / 知乎 `RichText` / IP 属地等，FR-008 + SC-002）
- 数据落 `<vault>/raw/clips/<slug>.md`

dev 实测：
1. 剪藏一个公众号文章 → `raw/clips/<slug>.md` 出现 + cover_url / publish_ts 在 frontmatter 里
2. 剪藏一个知乎回答 → IP 属地保留
3. 剪藏失败（不可达 URL）→ 错误 toast + 不留半截 .md（FR-009）

✅ US2 acceptance scenarios 1-6 全过 → commit。

## Step 6：US3 搜索切 vault index（半天）

改 `app/src-tauri/src/commands/search.rs`：`search_all(query)` 函数体从「vibe.db v4_search FTS」切到「vault-meta.db FTS5」。

注意：本 spec 范围只切笔记 / 剪藏的搜索；订阅 entries 搜索（如有）继续 SQLite（架构 §7.2）。

dev 实测：
1. 搜索 vault 笔记关键词 → 立即看到命中 + 高亮（沿用现有搜索 UI 不改）
2. 1k 篇规模 P95 ≤ 200ms（用 `time` 测）
3. 跨笔记 + 剪藏混合命中显示

✅ US3 acceptance scenarios 1-6 全过 → commit。

## Step 7：Claude 跑一次性搬迁脚本（半天）

写 `tmp/migrate-notes-clips-to-vault.py`（[data-model.md §一次性搬迁脚本](./data-model.md) 的伪码扩展成完整 Python）。

跑：

```bash
cd /Users/zoo/zoo/CC工作目录/进行中/mewmo
python3 tmp/migrate-notes-clips-to-vault.py \
  --vibe-db ~/Library/Application\ Support/com.vibecoding.app/vibe.db \
  --vault ~/Documents/mewmo-vault
```

验证 stdout 报告：
- N 条笔记搬到 `wiki/notes/` ✅
- M 条剪藏搬到 `raw/clips/` ✅
- 0 跳过 / 0 失败 ✅

dev 启动 mewmo → vault watcher 自动扫描新 `.md` 增量更新 FTS index → 4 tab 笔记 / 剪藏 list 跟搬迁前 vibe.db 行数一致（**双重验证**：vault `.md` 数 = 旧表行数 + 抽样内容一致）。

## Step 8：手工 SQL drop 老表（10 分钟）

vibe.db 老 notes / clips 表的代码路径已在 Step 4-6 全删除（`commands::notes` / `commands::clips` 不再调 vibe.db notes/clips）。剩下的就是物理 drop：

写 `app/src-tauri/migrations/v7_drop_notes_clips.sql`（vibe.db migration v7）：

```sql
-- v7: drop legacy notes / clips 表（数据已搬迁到 vault markdown）
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS clips;
-- vibe.db 内的 v4_search FTS5 笔记/剪藏部分（如果 v4 写在同 file 里，按需 surgical 删除）：
DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS clips_fts;
```

`db.rs` MIGRATIONS 数组 append `(7, include_str!("../migrations/v7_drop_notes_clips.sql"))`。dev 重启 mewmo → migration v7 跑 → vibe.db 笔记 / 剪藏表消失 + 4 tab 全功能仍正常（**关键验证**：drop 表后 mewmo 仍能用 = vault-first 切换成功）。

## Step 9：完整 e2e 验证 + journal entry（1 天）

写 `tmp/e2e-test.sh` 跑完整链路：
1. 装一个干净 vault + 拷一个 vibe.db 备份（dogfood 测试数据）进去
2. 跑 migrate 脚本
3. 启动 mewmo → 4 tab 笔记 / 剪藏 list 跟备份一致
4. 新建笔记 / 编辑剪藏 / 搜索 → 全过
5. 退 mewmo → Obsidian 打开 vault → 笔记/剪藏可见可改

跑 `pnpm tauri dev` 实测一遍（不跳过，code-quality.md rule 6.1）。

journal append 一条 「Phase 003 完成」entry：
- 实测耗时 / 各 SC 实测数据
- 暴露的问题 / 风险 / 下个 spec（004）的 follow-up

## Step 10：commit + push（最终）

按 mewmo 项目硬规则：feature 分支 commit ≠ 可合并。本 spec 完成后等用户测试关口确认再 merge 到 main。

提示用户：
- 全功能体验：4 tab + vault 同时可用 + Obsidian 直接打开 vault 看到所有笔记/剪藏
- 下一步：spec 004 起 AI 后端化 + 订阅 AI 检索

---

## 回滚（如必要）

dogfood 阶段简化兜底：

- **数据回滚**：vault `wiki/notes/` + `raw/clips/` 删除 → 启动 mewmo → 看到 4 tab 空（笔记/剪藏代码路径已切 vault）→ 重新跑搬迁脚本即可恢复
- **代码回滚**：`git revert` 本 spec commits，回到 spec 002 状态（笔记 / 剪藏继续走 vibe.db SQLite）
- **vibe.db 备份**：dogfood 阶段不在 app 内置自动备份（用户自己懂 cp / git）—— 但建议**手动**在 Step 7 跑搬迁脚本前 `cp vibe.db vibe.db.dogfood-backup-$(date +%s)` 兜底
