# Phase 0 Research: 笔记 / 剪藏切到 Vault Markdown

> 接续 [spec 002 research.md](../002-vault-wiki-foundation/research.md) 已敲定的架构层选型（18 个决策）。本 spec **不重新调研架构层**，仅记录 3 个本 spec 新增的局部决策。

## 决策 1：vault FTS5 索引方案

**Decision**：在 spec 002 已建的 `<vault>/.mewmo/vault-meta.db` 内加 FTS5 虚拟表（`notes_fts` + `clips_fts`，over vault markdown 的 title / body / tags），由 spec 002 已建的 `notify-debouncer-full` watcher 触发增量更新。

**Rationale**：
- 沿用 mewmo 现有 `v4_search.sql` 的 FTS5 + jieba 中文分词代码模式（已踩过坑 / 已实证），不新增技术栈
- 1k 篇规模性能已在 v4_search 实测 < 200ms（满足 SC-005 ≤ 200ms 门槛）
- 增量维护：watcher 检测 vault `.md` 改动 → 计算 diff → INSERT / UPDATE / DELETE FTS row
- 启动自愈：FTS index 损坏 / 缺失时一次性扫 vault markdown 重建（满足 FR-014）

**Alternatives considered**：
- **Tantivy**（Rust native search）：需新增 crate + 自维护 schema + 跨 SQLite/Tantivy 一致性管理；mewmo 不需要 BM25 之外的高阶能力，过度选型
- **ripgrep + cache**：每次搜索 spawn ripgrep，无增量 index，1k 规模冷启动 ≥ 300ms；不达 SC-005 门槛
- **沿用 vibe.db v4_search FTS over markdown 内容拷贝**：耦合 vibe.db 反向迁移路径，违反「真理与衍生分离」（架构 §3.1）

## 决策 2：Claude 一次性搬迁脚本语言

**Decision**：Python 3 + 标准库 `sqlite3` + `pathlib` + 第三方 `pyyaml`（生成 frontmatter）。脚本路径 `tmp/migrate-notes-clips-to-vault.py`，**不进 app bundle**，Claude 在 implementation 阶段一次性运行。

**Rationale**：
- 标准库 `sqlite3` + `pathlib` 足够读 vibe.db 笔记/剪藏 + 写 vault markdown；外部依赖仅 PyYAML（用户机器可能已装）
- Claude 写 Python 脚本最熟，迭代快
- 脚本要做的事简单：SELECT FROM notes/clips → 转 markdown 文件（含合法 frontmatter）→ 写到 vault `wiki/notes/` / `raw/clips/`
- **单次运行**（dogfood 单用户）：不需要事务化 / 断点续传 / 并发控制——这些是公开产品兼容机制，本 spec 砍掉

**Alternatives considered**：
- **Rust binary in `tmp/`**：要写 main + 处理依赖；脚本是开发动作不是产品，冗余
- **Bash + sqlite3 CLI + jq**：复杂 SQL 转 markdown 拼接 + frontmatter YAML 用 bash 易错
- **app 内 startup migration**（首次启动检测自动跑）：违反「dogfood 不写迁移代码」原则（[lessons/scope-单用户-不要写迁移代码.md](../../lessons/scope-单用户-不要写迁移代码.md)）

**脚本输出 frontmatter 格式**（详见 [data-model.md](./data-model.md)）：
- 笔记：`type / created / updated / tags / legacy_id`
- 剪藏：`type=clip / source / url / site_name / saved_at / excerpt / tags / legacy_id`

## 决策 3：commands::notes/clips wrapper 改写模式

**Decision**：每个 Tauri command 内部**完全替换**实现（不双写 / 不双读 / 不 feature flag），直接从 `vault::ingest` / `vault::query` / `vault::search` 调，前端 command 名签名不变（FR-017）。

**Rationale**：
- dogfood 单用户 = 不需要双写 / 双读期 / soft-delete（[project_dogfood_stage.md](../../.claude/memory/project_dogfood_stage.md) 已敲定）
- Tauri command 名签名不变 = 前端 `lib/db.ts` + `components/*` 零感知（spec 002 已建模式 + FR-017 / FR-028）
- 内部一次性切换 = 代码路径清爽，单一真相（架构 §3.1 vault-first）

**实施模式**：
| Tauri command | 旧实现（vibe.db）| 新实现（vault）|
|---|---|---|
| `list_notes` | `db.lock(); SELECT FROM notes;` | `vault::query::list_notes(&vault_path)` |
| `get_note(id)` | `SELECT FROM notes WHERE id=?` | `vault::query::get_note(&vault_path, &slug_or_legacy_id)` |
| `create_note(title, body, tags)` | `INSERT INTO notes` | `vault::ingest::write_note(&vault_path, frontmatter, body)` |
| `update_note(id, ...)` | `UPDATE notes SET ...` | `vault::ingest::update_note(&vault_path, &slug, ...)` |
| `delete_note(id)` | `DELETE FROM notes` | `vault::ingest::delete_note(&vault_path, &slug)` |
| 同模式 `commands::clips::*` | （SQLite clips 表）| `vault::ingest::*` / `vault::query::*` over `raw/clips/` |
| `search_all(query)` | vibe.db v4_search FTS5 | `vault::search::search(&vault_path, query)` |

**Alternatives considered**：
- **加 feature flag 双写双读**：违反 dogfood 阶段简化原则
- **新增 vault commands 函数**（如 `vault_list_notes` / `vault_save_clip`）+ 前端切到新名字：前端 components 零改动原则失败 + 不必要的 churn

## Phase 0 Research 完成

✅ 0 NEEDS CLARIFICATION 阻塞。3 个新增决策已沉淀。
✅ 大多数选型沿用 spec 002（依赖 / 架构 / 代码组织 / 测试策略），不重做调研。
✅ 可进 Phase 1 Design（data-model.md / quickstart.md）。
