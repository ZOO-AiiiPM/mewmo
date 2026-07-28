# Data Model: Vault + Wiki 架构骨架（Phase 0）

> **真理与衍生分离**（架构文档 §3.1）：vault/raw/* 和 vault/wiki/* 是 source of truth；`.mewmo/` 内 SQLite + log 是衍生物。这份 data-model 把每个 entity 的物理位置 + frontmatter / SQLite schema + validation / 状态转换列清楚。

## 1. Vault

**定义**：用户的本地知识库根目录。

**物理位置**：用户选定（默认 `~/Documents/mewmo-vault/`）

**结构契约**（顶层必含）：
- `raw/`（dir）—— 原始素材层，含 `_index.md` 占位
- `wiki/`（dir）—— 合成层，含 `_index.md` / `index.md` / `log.md`
- `.mewmo/`（隐藏 dir）—— 程序内部，含 `cat/` / `tags/` / `logs/` / `.locks/` 子目录

**配置文件**：`~/.mewmo/config.json`（不是 vault 内）
```json
{
  "vault_path": "/Users/zoo/Documents/mewmo-vault",
  "active_persona": "curious",
  "schema_version": 1,
  "initialized_at": "2026-05-27T10:00:00Z",
  "llm_provider": "anthropic"
}
```

**Validation**:
- vault_path 必须是绝对路径
- 初始化前必须确认目标路径不存在 / 非空时不能静默覆盖（FR-005）
- schema_version 用于未来 migration

**状态转换**: Uninitialized → Initialized（首次启动）→ Active（每次启动时检查路径仍存在）→ Missing（路径被外部删除时）

---

## 2. Raw 素材

**定义**：用户或 ingest 链放入的**原始内容**——剪藏全文 / 沉淀的 RSS / 用户拖入的图片或 PDF 等。**不可改**——是真理证据。

**物理位置**：
- `raw/clips/<slug>.html` + `<slug>.md`（剪藏：HTML 原文 + readability 提取后的 markdown）
- `raw/feeds-archived/<slug>.md`（沉淀的 RSS 内容）
- `raw/files/<filename>`（用户拖入的 PDF / docx 等）
- `raw/images/<filename>`（图片附件）
- `raw/_index.md`（raw 全局索引，类似 wiki 但只列原始素材）

**Schema**（仅 .md / .html 类有 frontmatter）：
```yaml
---
type: raw-clip | raw-feed | raw-file | raw-image
source_url: https://example.com/article  # 如有
captured_at: 2026-05-27T10:30:00Z         # ISO 8601
captured_by: user | cat | external-skill  # FR-022~028 谁触发的
content_format: html | markdown | binary
related_wiki: ../wiki/notes/<slug>.md     # ingest 完成后回填
---
```

**Validation**:
- type 必须是上述四种之一
- captured_at 必须 ISO 8601 with timezone（Z 或 ±HH:MM）
- 文件名（slug）符合 FR-016（中文保留 / 无 emoji / 无空格 / 碰撞加 `-2`）
- 二进制文件（图片 / PDF）单独放 `raw/files/` `raw/images/`，**不带 frontmatter**

**State**: Captured → Ingested（wiki 摘要页生成后 related_wiki 字段回填）→ Archived（用户可标 archived 但不删，留历史证据）

---

## 3. Wiki 页

**定义**：LLM 在 ingest 时合成 + 用户编辑共同构成的合成层。**可改**——是 Layer 2。

**物理位置 / type 映射**：
| type | 路径模式 |
|------|---------|
| `user-note` | `wiki/notes/<slug>.md`（用户主动写的笔记，cat 可加 tag 但不改正文）|
| `wiki-summary` | `wiki/notes/<slug>.md`（剪藏 / 沉淀触发的 cat 摘要）|
| `entity` | `wiki/entities/<slug>.md`（人 / 产品 / 地点页）|
| `topic` | `wiki/topics/<slug>.md`（主题合成页）|
| `report` | `wiki/reports/daily/<YYYY-MM-DD>.md` 或 `wiki/reports/weekly/<YYYY>-W<##>.md` |
| `cat-diary` | `wiki/cat-diary/<YYYY-MM-DD>.md` |
| `todo` | `wiki/todos/active/<slug>.md` 或 `wiki/todos/done/<slug>.md` |

**Frontmatter schema**（必填）:
```yaml
---
type: user-note | wiki-summary | entity | topic | report | cat-diary | todo
created: 2026-05-27T10:30:00Z         # ISO 8601 with TZ
updated: 2026-05-27T15:00:00Z         # 每次写更新
author: user | cat                    # 主责作者
tags: [ai, knowledge-management]      # FR-029~033 复用 supertag
---
```

**Frontmatter schema**（可选，按 type）:
```yaml
source: ../raw/clips/example.md       # 衍生页指向 raw 源（wiki-summary / entity 用）
related: [../entities/karpathy.md, ../topics/llm-wiki.md]   # 双向链接
status: active | done | archived      # 仅 todo
due: 2026-06-01                       # 仅 todo
slug: ai-and-knowledge-mgmt           # 显式 slug（默认从文件名推）
```

**Validation**:
- type 必填且必须是上表 7 种之一
- created / updated 必须 ISO 8601 with TZ
- author 必须是 `user` 或 `cat` 二选一
- source / related 用相对路径（`../`），保证 vault 整体可移动（PRD §9.4 #7）
- 所有 markdown 链接走相对路径（同上）
- 文件名（slug）符合 FR-016

**State**:
- user-note：Draft → Published（用户保存）→ Archived（手工归档，移到 wiki/notes/_archive/）
- wiki-summary / entity / topic：Generated（cat 写入）→ Edited（用户改过）→ Stale（cat 检测到 source 变化但还没重 ingest）
- todo：Active → Done（移动到 wiki/todos/done/）→ Archived
- report / cat-diary：Generated（一次性）→ Edited

**链接图**：vault 内 .md 之间通过 `related: [...]` + 正文里的相对路径 markdown 链接构成图。Phase 0 不主动维护反向链接索引（不画图），Phase 4 lint pass 才会扫。

---

## 4. 全局聚合页（mutex 热点）

**定义**：vault 内**多 writer 协调更新**的高频热点页。FR-008 + FR-010 要求串行化 / 跨进程协调。

**列表**:
| 文件 | 维护规则 | 写者 |
|------|---------|------|
| `wiki/index.md` | 增量 append（FR-009），不重写历史行；按 type 分组 | ingest 链 / user 手工编辑 |
| `wiki/log.md` | append-only 时间线；每条 = ISO 时间戳 + 事件 + 影响路径 | ingest 链 / cat 主动行为 |
| `.mewmo/cat/memory/recent-focus.md` | 滚动更新 + 周更归档；mewmo 维护区段 + 用户区 | cat 周更 |
| `.mewmo/cat/memory/about-user.md` | 累积更新 + 季度更新；mewmo 维护区段 + 用户区 | cat 季度更 |

**fence 标记约定**（用户区与 mewmo 维护区分隔）:
```markdown
<!-- mewmo:managed-start -->
[mewmo 自动维护内容，用户改了下次 ingest 会被覆盖]
<!-- mewmo:managed-end -->

[用户自由编辑区，mewmo 不动]
```

**Validation**:
- index.md / log.md 必须是 markdown 合法
- log.md 每条必须独立行 + 严格按时间倒序（最新在顶？还是底？）
  - **决策**：log.md 用 append-only 写**底部**（FR-009 说仅追加，git diff 验证仅追加），UI 渲染时倒序展示给用户
- recent-focus / about-user 的 mewmo 维护区段必须有 fence 标记，更新时只动这段

**并发约束**:
- 进程内：tokio::sync::Mutex 守护这 4 个文件（vault.ts 是天然 mutex 点）
- 跨进程：mkdir-as-mutex 保护，每次写前 `mkdir <vault>/.mewmo/.locks/<file-name>/`
- 写文件本身用 atomic rename（FR-007）

---

## 5. Cat Persona / Voice

**定义**：定义猫的性格、说话风格、场景化 voice 模板的 .md 文件。**用户可改**——FR-018 要求改完下次 LLM 调用立即生效。

**物理位置**:
- `.mewmo/cat/persona-curious.md`（好奇）
- `.mewmo/cat/persona-gentle.md`（温柔）
- `.mewmo/cat/persona-sharp.md`（锐利）
- `.mewmo/cat/persona-casual.md`（散漫）
- `.mewmo/cat/persona-steady.md`（沉稳）
- `.mewmo/cat/voice-template.md`（场景化模板）
- `.mewmo/cat/active.txt`（当前 active persona id，单行：`curious` / `gentle` / `sharp` / `casual` / `steady`）

**Persona schema**:
```markdown
---
id: curious
name: 好奇
created: 2026-05-27T10:00:00Z
version: 1
---

## 性格描述

[自由文本：这只猫的性格、价值观、好奇心方向、对用户的态度]

## 说话习惯

- 句长偏好：[短 / 中 / 长]
- 用词倾向：[词汇举例]
- 提问倾向：[多 / 少]
- emoji / 颜文字使用：[频率描述]

## 关键词触发偏好

[当用户输入含 X 主题时，cat 倾向 Y 反应]

## 长度偏好

- 默认输出长度：≤ 400 字
- 详细输出长度：≤ 800 字
```

**Voice template schema**（场景化）:
```markdown
---
type: voice-template
created: ...
---

## ingest 完成反馈

[模板：「记下来啦，存在了 {path}」类，3-5 个变体让 cat 不重复]

## query 回答开头

[模板：「我翻了翻你以前写的，看到这几条…」]

## 错误反馈

[模板：「我没 key 没法干活」「网断了，等下再来」]

## 主动行为开头

[「今天一天我都看着...」]
```

**Validation**:
- persona id 必须 5 选 1（curious / gentle / sharp / casual / steady）
- frontmatter 必填字段：id / name / created / version
- voice-template 必填段：ingest 反馈 / query 开头 / 错误 / 主动行为
- active.txt 单行 + 必须是 5 id 之一；不存在或不合法 → 降级到 curious（默认）+ 用户可见警告（FR-020）

**State**: Default（5 个预设）→ Edited（用户修改）→ Reset（用户可选恢复默认）

**LLM inject 协议**（FR-018 实现要求）:
- 每次 LLM 调用前**重读** `.mewmo/cat/active.txt` → 重读对应 persona-*.md → 重读 voice-template.md → 拼装到 system prompt 内
- 启用 prompt cache（cache_control 标记）但**文件 hash 变化**时 cache 自动失效（cache key 含文件 mtime / content hash）
- **不依赖会话级缓存**——POC-3 长 session 跳戏教训

---

## 6. Cat Memory

**定义**：猫对用户的长期记忆 + 近期关注 + 长期对话线程。Phase 0 仅建文件骨架，**自动更新逻辑落 Phase 1+**。

**物理位置**:
- `.mewmo/cat/memory/about-user.md`（长期画像，季度更）
- `.mewmo/cat/memory/recent-focus.md`（近期关注，周更）
- `.mewmo/cat/memory/threads/<topic-slug>.md`（长期对话线程，按主题）

**Schema**:
```yaml
---
type: cat-memory
subtype: about-user | recent-focus | thread
last_synced: 2026-05-27T15:00:00Z   # cat 上次同步该文件时间
update_cadence: weekly | quarterly | event-driven
---
```

正文按全局聚合页 fence 约定（mewmo 维护区 + 用户自由区）。

**Phase 0 边界**:
- 仅建 `.mewmo/cat/memory/` 目录 + about-user.md / recent-focus.md 占位文件
- threads/ 留空目录
- 自动更新逻辑（cat 周更 / 季度更）**不实现** —— Phase 4 自我进化阶段做

---

## 7. Supertag

**定义**：参考 Tana supertag 概念——tag = 名称 + 描述 + 触发关键词 + frontmatter 模板。

**物理位置**:
- `.mewmo/tags/_index.md`（全 tag 清单 + 元信息）
- `.mewmo/tags/<tag-name>.md`（每个 supertag 独立文件）

**Supertag schema**:
```markdown
---
name: book
description: 读书笔记的 supertag
created: 2026-05-27T10:00:00Z
keywords: [读书, 阅读, 书评, ISBN]
template_fields:
  - {name: author, type: string, required: true}
  - {name: title, type: string, required: true}
  - {name: status, type: enum, options: [reading, finished, abandoned]}
  - {name: rating, type: number, range: [1, 5]}
---

[人类可读描述：什么时候该用这个 tag，举例]
```

**`_index.md` schema**（FR-029 + FR-032）:
```markdown
# Tags Index

<!-- mewmo:managed-start -->

| name | description | usage_count |
|------|-------------|-------------|
| book | 读书笔记的 supertag | 12 |
| ai | AI / LLM / agent 相关 | 35 |
| ... | ... | ... |

<!-- mewmo:managed-end -->

[用户自由编辑区：可写 tag 使用约定 / 团队规范 / 备注]
```

**Validation**:
- tag-name 文件名符合 FR-016（中文保留 / 无 emoji / 无空格）
- frontmatter name 字段必须等于文件名（小写）
- keywords 数组长度 1-10
- template_fields 数组每项必须有 name / type；type 必须是 string / number / enum / date / boolean 之一
- 损坏的 supertag 文件**跳过** + log 警告（FR-031），不影响其他 tag

**State**: User-Created → Indexed（mewmo 扫描后写入 _index.md）→ Used（usage_count 增加）→ Deleted（用户删 supertag 文件，_index.md 移除条目，**笔记里已用的不动**）

**Phase 0 边界**:
- 仅做格式约定 + 数据骨架 + `_index.md` 自动维护扫描
- LLM 自动打 tag 复用 + 周更 lint 演化 → **Phase 1+ 才实现**（FR-034）

---

## 8. Skill 包

**定义**：mewmo 暴露的内置 Skill 集合，部署到 Anthropic 标准位置。猫和外部 Claude Code 共用同一份实现。

**物理位置（Skill 实现源）**：`app/src-tauri/skills/`（打包进 app bundle）

**部署位置**（首次启动 / 升级时复制）：`~/.claude/skills/mewmo/`

**结构**:
```text
~/.claude/skills/mewmo/
├── SKILL.md                # 入口说明
├── capture/
│   ├── SKILL.md            # /mewmo:capture <text|url> 命令描述
│   └── scripts/capture.py  # 实现
├── search/SKILL.md         # stub（声明存在但 v0 提示「未实现」）
├── query/SKILL.md          # stub
├── lint/SKILL.md           # stub
└── _shared/
    └── vault.py            # Python 端 Layer 1 IO（含 mkdir-mutex）
```

**SKILL.md schema**（每个 Skill 一个）:
```markdown
---
name: capture
description: 把一段文本或 URL 捕获到 mewmo vault，由猫摘要后写入 wiki/notes/
mewmo_version_required: ">=0.2.0"
---

## Usage

`/mewmo:capture <text or url>`

## Behavior

[详细说明：触发什么 ingest 链、产出什么 .md、错误处理]
```

**Validation**:
- name 必须和目录名一致
- mewmo_version_required 用 semver range
- capture/SKILL.md 必须有完整 Behavior 描述
- search / query / lint 的 SKILL.md 可以是 stub，但必须存在（FR-023）

**State**: Bundled（在 app/src-tauri/skills/）→ Deployed（首次启动复制到 ~/.claude/skills/mewmo/）→ Updated（mewmo 升级时同步更新）

---

## 9. LLM 调用日志

**定义**：每次 LLM 调用 / 文件锁获取 / Skill 调用的结构化记录。**衍生数据**——可丢可重建（FR-035）。

**物理位置**：`<vault>/.mewmo/logs/<YYYY-MM-DD>.jsonl`（每天一个文件，按行 JSON）

**单行 schema**:
```json
{
  "timestamp": "2026-05-27T15:30:45.123Z",
  "type": "llm_call | mutex_acquire | mutex_release | skill_invoke | file_write | error",
  "session_id": "uuid-v4",
  "trigger": "user-ingest | cat-scheduled | external-skill",
  
  "...llm_call only fields...":
  "model": "claude-sonnet-4-6 | claude-haiku-4-5 | claude-opus-4-7",
  "input_tokens": 1234,
  "output_tokens": 567,
  "cache_read_input_tokens": 1024,
  "cache_creation_input_tokens": 0,
  "latency_ms": 2340,
  "cost_usd": 0.0123,
  "step": "step1-summarize | step2-influence | step3-rewrite",
  
  "...mutex_acquire/release...":
  "resource": "wiki/index.md | .mewmo/cat/persona.md",
  "wait_ms": 12,
  "holder": "ingest-chain-abc123",
  
  "...skill_invoke only fields...":
  "skill": "capture | search | query | lint",
  "args": "<truncated>",
  "duration_ms": 3456,
  "success": true,
  
  "...error only fields...":
  "error_class": "LLMTimeout | FileWrite | SkillNotFound | LostUpdateDetected",
  "error_message": "...",
  "stack_trace": "..."
}
```

**Validation**:
- 每行必须独立 JSON（不能跨行）
- timestamp ISO 8601 with millisecond + UTC
- type 必须是上述 6 种之一
- 文件按日期切割（00:00 UTC 切到下一文件）

**Retention**:
- Phase 0 不做自动清理（dogfood 1 个月内手动清）
- Phase 4 lint pass 时检测 ≥30 天前的日志可归档 / 删

---

## 10. vault-meta.db（衍生 SQLite）

**定义**：vault 模式的衍生索引。**衍生**——损坏可重建。

**物理位置**：`<vault>/.mewmo/vault-meta.db`

**Schema**（migrations 数组定义，参考 `db.rs` 风格）:
```sql
-- migration 1: 初始 schema
CREATE TABLE schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version VALUES (1);

CREATE TABLE feed_stream (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  published_at TEXT,    -- ISO 8601
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL  -- new | sedimented | dismissed
);

CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- session-start | ingest | query | cat-diary | ...
  details TEXT               -- JSON blob
);

CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  channel TEXT NOT NULL,     -- in-app | macos | none
  category TEXT,
  payload TEXT
);

CREATE TABLE cat_memory_metadata (
  page_path TEXT PRIMARY KEY,    -- 相对 vault 路径
  last_synced TEXT NOT NULL,
  update_cadence TEXT,
  last_writer TEXT
);
```

**Phase 0 边界**:
- 仅建 schema 占位 + migrations[0]
- 表里**不写**任何数据（Phase 1 / 2 / 3 各模块再填）
- vibe.db 与 vault-meta.db **并存**——v1 阶段不混用，旧 4 tab 数据继续在 vibe.db

---

## 状态机汇总（实体级 state transitions）

```
[Vault]              Uninitialized → Initialized → Active → (Missing)
[Raw]                Captured → Ingested → (Archived)
[Wiki user-note]     Draft → Published → (Archived)
[Wiki summary]       Generated → Edited → (Stale on source change)
[Wiki todo]          Active → Done → (Archived)
[Cat Persona]        Default → Edited → (Reset)
[Supertag]           User-Created → Indexed → Used → (Deleted, 笔记内已用的 tag 不动)
[Skill]              Bundled → Deployed → Updated
[LLM log]            Append-only → (Phase 4 归档)
```

**最重要约束**：所有「→（括号）」状态转换是**保持数据可恢复**——Archived 的 raw 仍能被读、Deleted 的 supertag 不连带删笔记 tag、Stale 的 wiki summary 仍能被打开（只是 cat 提示需要重 ingest）。**没有真正的"删除原始数据"路径**——这是 vault-first 承诺的体现（spec FR-004 / FR-033）。
