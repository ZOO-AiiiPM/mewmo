# Data Model: 笔记 / 剪藏切到 Vault Markdown

> 本文件描述本 spec 涉及的数据实体 schema + 状态转换 + 校验规则。沿用 [spec 002 data-model.md](../002-vault-wiki-foundation/data-model.md) 已定的 vault 真理与衍生原则、frontmatter 解析规则、slug 生成规则。

## 实体清单

本 spec 涉及 4 个实体：

| 实体 | 真理 / 衍生 | 位置 | 本 spec 操作 |
|---|---|---|---|
| **Wiki Note** | 真理 | `<vault>/wiki/notes/<slug>.md` | 新建 / 列表 / 读 / 写 / 删 |
| **Raw Clip** | 真理 | `<vault>/raw/clips/<slug>.md` | 同上 |
| **Vault FTS Index** | 衍生 | `<vault>/.mewmo/vault-meta.db` 的 `notes_fts` + `clips_fts` 虚拟表 | 增量维护 + 启动自愈 |
| **Legacy SQLite Tables** | 已废弃 | vibe.db 的 `notes` / `clips` 表 | Claude 跑搬迁脚本 + 验证完后 SQL drop |

## Wiki Note Schema

**文件路径**：`<vault>/wiki/notes/<slug>.md`，slug 生成沿用 spec 002 FR-016（`sanitize-filename` + 中文保留 + emoji 过滤 + 长度 ≤ 80 + 碰撞加 `-2` `-3`）。

**Frontmatter 字段**：

```yaml
---
type: user-note                # 必填，固定值
created: 2026-05-28T14:30:00Z  # 必填，ISO 8601 UTC
updated: 2026-05-28T15:45:00Z  # 必填，ISO 8601 UTC（=created 时初始）
tags: [ai, knowledge-management]  # 可空数组
legacy_id: 42                  # 可选，搬迁脚本写入用来追溯 vibe.db 旧 id
---

# 笔记标题（H1，可选——与 frontmatter 不冲突）

正文 markdown 内容...
```

**字段约束**：
- `type` 必填 `user-note`（区分剪藏 / 报告 / 等其他 wiki 类型）
- `created` / `updated` ISO 8601 UTC 含 `Z` 后缀；`updated >= created`
- `tags` 数组（可空），元素是非空字符串，去重，长度合理
- `legacy_id` 可选 INTEGER，仅搬迁脚本写入；新建笔记不写

**正文约定**：
- Markdown 标准（不强制 H1 标题——title 由 frontmatter / 文件名表达）
- 允许内嵌图片（`![](images/foo.png)` 相对路径指向 `<vault>/raw/images/`）
- 不允许 `<script>` / 未净化 HTML（防 XSS，沿用 spec 002 sanitize_html.ts 模式）

**状态转换**：
- 新建：`commands::notes::create_note(title, body, tags)` → `vault::ingest::write_note` → atomic write `<vault>/wiki/notes/<slug>.md`（spec 002 FR-007）
- 编辑：`commands::notes::update_note(slug, ...)` → atomic write，更新 `updated`
- 删除：`commands::notes::delete_note(slug)` → 物理 `unlink`（dogfood 阶段不要回收站）
- 外部编辑：用户在 Obsidian 改 → mewmo watcher 检测 → 增量更新 vault FTS index（spec 002 FR-004 + FR-013）

## Raw Clip Schema

**文件路径**：`<vault>/raw/clips/<slug>.md`

**Frontmatter 字段**：

```yaml
---
type: clip                     # 必填，固定值
source: web                    # 必填，固定值（未来可扩展 pdf / video）
url: https://example.com/article  # 必填
site_name: Example Blog        # 可选（来自 og:site_name）
title: 文章标题                 # 必填
saved_at: 2026-05-28T14:30:00Z # 必填，ISO 8601 UTC
excerpt: 文章摘要前 200 字...   # 可选
author: 作者名                  # 可选（来自 meta name=author）
tags: []                       # 可空数组（用户后续可加）
legacy_id: 17                  # 可选，搬迁脚本写入

# 公众号 / 知乎等中文站点专属字段（沿用 clip_parser.rs 693 行精调，FR-008）
publish_ts: 2026-05-15T08:00:00+08:00  # 可选（公众号 wx_publish_ts）
cover_url: https://...        # 可选（公众号 cdn_url_1_1 正方形封面）
ip_location: 上海              # 可选（知乎 IP 属地）
---

正文 markdown（由 readability 提取 + 现有 clip_parser.rs 转 md）...
```

**字段约束**：
- `type` 必填 `clip`
- `url` 必填 + 形如 `https?://`
- `saved_at` ISO 8601 UTC 含 `Z`
- 中文站点专属字段（`publish_ts` / `cover_url` / `ip_location`）来自现有 `clip_parser.rs` 抓取逻辑，**保留不丢**（FR-008 + SC-002 中文优化字段保留率 100%）

## Vault FTS Index Schema

**位置**：`<vault>/.mewmo/vault-meta.db`（spec 002 P1 占位的 SQLite，本 spec 启用）

**Migration v3（本 spec 新增）**：

```sql
-- vault-meta.db migration v3: 笔记 + 剪藏 FTS5 索引
CREATE VIRTUAL TABLE notes_fts USING fts5(
  slug UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'unicode61'  -- 后续可换 jieba（沿用 mewmo v4_search.sql 模式）
);

CREATE VIRTUAL TABLE clips_fts USING fts5(
  slug UNINDEXED,
  url UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'unicode61'
);

-- 元数据表：记录已索引文件 mtime，用于增量更新
CREATE TABLE indexed_files (
  slug TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('note', 'clip')),
  mtime INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_indexed_files_type ON indexed_files(type);
```

**增量维护流程**：
1. spec 002 已建的 `notify-debouncer-full` watcher 检测到 `<vault>/wiki/notes/*.md` 或 `<vault>/raw/clips/*.md` 改动事件
2. Rust handler 比对文件 mtime 与 `indexed_files.mtime`：
   - 新增：INSERT 到 `notes_fts` / `clips_fts` + INSERT 到 `indexed_files`
   - 修改：UPDATE 对应 FTS row + UPDATE `indexed_files.mtime`
   - 删除：DELETE FTS row + DELETE `indexed_files`
3. 启动自愈（FR-014）：检测 FTS 表不存在 / 行数与 `<vault>/{wiki/notes,raw/clips}/*.md` 数量不匹配 → 一次性扫所有 markdown 重建

## Legacy SQLite Tables（待 drop）

**位置**：`~/Library/Application Support/com.vibecoding.app/vibe.db`

**待 drop 的表**：

```sql
-- 现有 vibe.db schema（v6 之前的 migration，沿用结构）：
-- - notes(id, title, content_md, tags_text, created_at, updated_at, ...)
-- - clips(id, title, url, site_name, content_md, excerpt, saved_at, ...)
-- - v4_search.sql 中 notes_fts / clips_fts FTS5 虚拟表（笔记/剪藏部分）

-- v7 migration（本 spec 新增）：
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS clips;
DROP TABLE IF EXISTS notes_fts;        -- vibe.db 的 v4_search 笔记 FTS（不是 vault-meta.db 的）
DROP TABLE IF EXISTS clips_fts;        -- 同上剪藏 FTS

-- 不动：subscriptions / subscription_sources / feed_entries / 沉淀相关表
```

**执行节奏**：
1. Claude 跑 `tmp/migrate-notes-clips-to-vault.py` 一次性搬迁
2. dev 实测笔记 / 剪藏 / 搜索 4 tab 正常显示（双重验证：vault `.md` 数 = 旧 SQLite 行数 + 内容一致）
3. **手工**执行 `sqlite3 vibe.db < migrations/v7_drop_notes_clips.sql` drop 老表（不在 app 内）
4. 跑 mewmo dev 再次验证 4 tab 全功能正常（笔记/剪藏完全走 vault，订阅继续 SQLite）

## 一次性搬迁脚本输入输出

**位置**：`tmp/migrate-notes-clips-to-vault.py`（gitignore，不进 bundle）

**输入**：
- `~/Library/Application Support/com.vibecoding.app/vibe.db`（vibe.db 文件路径，可命令行参数覆盖）
- `~/Documents/mewmo-vault/`（vault 路径，可命令行参数覆盖）

**输出**：
- `<vault>/wiki/notes/<slug>.md` ×N（每条 SQLite notes → 一个 .md）
- `<vault>/raw/clips/<slug>.md` ×M（每条 SQLite clips → 一个 .md）
- stdout：搬迁报告（N 条笔记 + M 条剪藏 + 跳过 / 失败列表）

**搬迁逻辑**（伪码）：

```python
import sqlite3, yaml, pathlib

def migrate_notes(vibe_db, vault_root):
    conn = sqlite3.connect(vibe_db)
    rows = conn.execute("SELECT id, title, content_md, tags_text, created_at, updated_at FROM notes").fetchall()
    for id, title, body, tags_text, created, updated in rows:
        slug = sanitize_slug(title or f"untitled-{id}")
        path = vault_root / "wiki/notes" / f"{slug}.md"
        if path.exists():
            slug = dedup(slug)  # 加 -2 -3 后缀
            path = vault_root / "wiki/notes" / f"{slug}.md"
        frontmatter = {
            "type": "user-note",
            "created": ts_to_iso(created),
            "updated": ts_to_iso(updated),
            "tags": parse_tags(tags_text),
            "legacy_id": id,
        }
        content = f"---\n{yaml.dump(frontmatter)}---\n\n{body}\n"
        path.write_text(content)
        # 也写到 indexed_files + FTS5 由 mewmo 启动时自愈，不在脚本内做
    print(f"Migrated {len(rows)} notes")

# 同理 migrate_clips（含中文站点专属字段保留）
```

**校验**（脚本最后）：
- vault `wiki/notes/*.md` 数量 = vibe.db notes 表行数（SC-006 0 起丢条）
- vault `raw/clips/*.md` 数量 = vibe.db clips 表行数
- 随机抽 5 条对比 markdown 内容跟 SQLite 原文一致

## 校验规则总结

| 实体 | 校验时机 | 校验内容 |
|---|---|---|
| Wiki Note frontmatter | 写入前 | type / created / updated 必填 + ISO 8601 格式 |
| Raw Clip frontmatter | 写入前 | type / source / url / saved_at / title 必填 |
| Vault FTS index | 启动时 | indexed_files 行数 = vault markdown 数 |
| 搬迁脚本输出 | 跑完时 | vault `.md` 数 = vibe.db 表行数 + 抽样内容一致 |
