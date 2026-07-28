# Feature Specification: 笔记 / 剪藏切到 Vault Markdown

**Feature Branch**: `feature/vault-wiki`（沿用 spec 002 分支，spec 编号 003）
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "当前 spec 还是先只做数据迁移吧，迁移后 sql 不需要了。一键清空之间的数据 / 你做 app 时直接采用新的架构，不需要保留任何的迁移代码。迁移是你来 ai 迁移，目前没有用户，只有我在使用，不需要担心数据问题"

> **Scope 边界**：mewmo 当前是 **dogfood 单用户阶段**（PRD §13 短期成功度量「自己 dogfood 1 个月」），没有外部用户的升级路径要保护。本 spec 只做一件事：让 app 代码**直接采用新架构**——笔记 / 剪藏 = vault markdown 文件（订阅继续 SQLite 不动）。**不写任何迁移 / 备份 / 双读 / soft-delete / cleanup 保险机制**——那些是公开产品兼容机制，dogfood 阶段全是过度设计。现有 vibe.db 里我自己的笔记/剪藏数据由 **Claude（开发助手）跑一次性脚本搬迁**（脚本不进 app bundle，是开发动作不是产品功能）。**不在范围**：AI 后端化（推独立 spec 004）/ 订阅 AI 检索（推 spec 004）/ 订阅源迁移（架构 §7.2 永远 SQLite）。

## User Scenarios & Testing *(mandatory)*

<!--
  3 个 user story 按数据类型切（笔记 / 剪藏 / 搜索），各自独立可测。
  没有「数据迁移」「升级路径」「数据零丢失保险」类 user story——dogfood 阶段不需要。
-->

### User Story 1 - 笔记 tab 读写 vault Markdown（Priority: P1）🎯 MVP

用户在 mewmo 笔记 tab 新建笔记 / 编辑标题正文 / 加标签 / 删除笔记，所有写入落到 `~/Documents/mewmo-vault/wiki/notes/<slug>.md`（含合法 frontmatter），**不再写 vibe.db 的 notes 表**。退出 mewmo 用 Obsidian 打开 vault → 看到所有笔记，frontmatter 渲染正常，markdown 渲染正常，标签可点。在 Obsidian 内编辑保存某条笔记，重启 mewmo 看到改动同步显示。

**Why this priority**：vault-first 是 mewmo 跟 Notion / Apple Notes 等闭源产品的核心差异化承诺（PRD §5.1 + 架构 §3.1）。笔记是用户最高频产出，让笔记落 vault = vault-first 落地的最关键证据。即使 US2/US3 都不做，光做完 US1 用户也已获得「笔记永远属于我，Obsidian 能直接打开」的独立价值。

**Independent Test**：mewmo 笔记 tab 新建一条笔记「测试笔记」，写正文 + 加标签 → 保存 → 退出 mewmo → `ls ~/Documents/mewmo-vault/wiki/notes/` 看到「测试笔记.md」，cat 看到合法 frontmatter + 正文 + 标签 → Obsidian 打开 vault → 笔记列表里看到，标题正文标签都对 → Obsidian 内改正文保存 → 重启 mewmo → 笔记 tab 看到改动同步。

**Acceptance Scenarios**:

1. **Given** vault 已初始化，**When** 用户在笔记 tab 新建笔记并保存，**Then** `wiki/notes/<slug>.md` 出现，含 frontmatter（type / created / updated / tags / 等）+ 正文 markdown
2. **Given** 已有笔记，**When** 用户编辑标题 / 正文 / 标签并保存，**Then** vault `.md` 文件原子更新（atomic rename，不出现半截损坏）
3. **Given** 已有笔记，**When** 用户删除，**Then** vault `.md` 文件被删（或移到 trash 目录，本 spec 选物理删除——单用户 dogfood 不需要回收站）
4. **Given** 用户在 Obsidian 编辑了 vault 内一条笔记 .md 并保存，**When** 切回 mewmo，**Then** 笔记 tab 显示用户在 Obsidian 改的内容（沿用 spec 002 FR-004 外部改动尊重）
5. **Given** 用户搜索 / 列表笔记，**When** mewmo 显示列表，**Then** 数据来自 vault（不读 vibe.db notes 表）
6. **Given** vault `.md` 已不存在 vibe.db notes 表的代码路径，**When** ripgrep 扫 `app/src-tauri/src/commands/notes.rs` + `app/src/lib/db.ts` 笔记部分，**Then** 0 命中 SQLite notes 表的 SQL 语句
7. **Given** 用户在笔记 tab 自动保存触发频繁（NoteEditor 每次输入暂停后），**When** atomic write 多次发生，**Then** 不出现锁竞争 / 损坏 / 丢失（沿用 spec 002 vault/locks.rs mkdir-mutex）

---

### User Story 2 - 剪藏 tab 读写 vault Markdown（Priority: P2）

用户在 mewmo 剪藏网页（粘贴 URL 或浏览器扩展）→ readability 提取主内容 → 落到 `~/Documents/mewmo-vault/raw/clips/<slug>.md`（含 frontmatter 标 type=clip / source URL / site_name / saved_at / excerpt / 等）。**不再写 vibe.db 的 clips 表**。退出 mewmo 用 Obsidian 打开 vault → 看到所有剪藏，包括当前网页正文 markdown / 公众号 / 知乎 / 等中文站点的内容。

**Why this priority**：剪藏是 mewmo 第二高频产出（仅次于笔记），覆盖「捕获」环节（PRD §3.3 6 大场景之一）。让剪藏落 vault = 「捕获 + 整理」核心 Loop（宪法原则 II）有完整的 vault-first 实现。优先级 P2 而非 P1：即使 US1 已让笔记走 vault，剪藏没动产品形态会感觉「笔记是 vault / 剪藏是 SQLite」分裂感强。

**Independent Test**：在 mewmo 剪藏一个网页（如 https://example.com/article）→ 几秒后剪藏 tab 看到 → 退出 mewmo → `ls ~/Documents/mewmo-vault/raw/clips/` 看到对应 .md → cat 看到合法 frontmatter + 正文（含中文，公众号 / 知乎等中文优化字段保留）→ Obsidian 打开 vault → 剪藏可见、可点链接、内嵌图片 url 显示正常。

**Acceptance Scenarios**:

1. **Given** vault 已初始化，**When** 用户剪藏一个网页（粘 URL / 浏览器扩展），**Then** `raw/clips/<slug>.md` 出现，含 frontmatter（type=clip / source URL / site_name / saved_at / excerpt / 等）+ 正文 markdown
2. **Given** 公众号 / 知乎等中文站，**When** 剪藏，**Then** 中文优化字段（如公众号 cdn_url_1_1 封面 / 知乎 RichText / IP 属地等）保留在 frontmatter 或正文里（沿用现有 clip_parser.rs 693 行精调）
3. **Given** 已有剪藏，**When** 用户编辑（标题 / 笔记 / 标签）/ 删除，**Then** vault `.md` 原子更新或删除
4. **Given** 用户在 Obsidian 编辑剪藏 `.md` 并保存，**When** 切回 mewmo，**Then** 剪藏 tab 显示用户改动（外部改动尊重）
5. **Given** 用户列表 / 搜索剪藏，**When** mewmo 显示列表，**Then** 数据来自 vault（不读 vibe.db clips 表）
6. **Given** ripgrep 扫 `app/src-tauri/src/commands/clips.rs` + `app/src/lib/db.ts` 剪藏部分，**When** 检查，**Then** 0 命中 SQLite clips 表的 SQL 语句

---

### User Story 3 - 全文搜索切到 Vault Index（Priority: P3）

用户在 mewmo 搜索框输入关键词，搜索笔记 / 剪藏全文 + 标题 + 标签命中。结果**全部来自 vault 索引**（FTS5 over vault markdown，由 vault-meta.db 维护），不再走 vibe.db 的 v4_search.sql FTS。1k 篇规模笔记/剪藏总数下搜索 P95 ≤ 200ms。

**Why this priority**：US1 / US2 让笔记/剪藏数据落 vault，但**搜索仍走旧 SQLite FTS** 的话，UI 上的搜索功能会突然全失效。搜索是用户日常高频操作（PRD 5.1「自动结构化（不浪费时间整理）」+ 6 大场景之 4「写作准备」），不能退化。优先级 P3 而非更高：搜索是「让前两个 story 真正可用」的横切支撑，不是独立产品价值——但缺了它前两个 story 用户体验断崖式下跌。

**Independent Test**：完成 US1 + US2（vault 内有真实笔记/剪藏 markdown）→ mewmo 搜索框输入笔记内容里的某个关键词 → 立即看到命中结果 → 命中条目点开能看到正文（来自 vault）+ 高亮命中词 → 关键词只在 vibe.db 老数据里有但 vault 没有的话搜不到（验证不在读旧 FTS）。

**Acceptance Scenarios**:

1. **Given** vault 内有 N 条笔记 + M 条剪藏，**When** 用户搜索笔记内容关键词，**Then** 结果列表来自 vault index（FTS5 over markdown），含命中标题 / 正文片段 / 高亮
2. **Given** vault index 还没建好（首次启动），**When** 用户搜索，**Then** 系统在后台 build index + UI 显示「索引中...」提示，不报错（fail-loud）
3. **Given** 用户在 Obsidian 改了 vault `.md` 文件，**When** 切回 mewmo 搜索，**Then** vault watcher 检测改动 + 增量更新 index（沿用 spec 002 notify-debouncer-full）
4. **Given** 1k 篇规模笔记/剪藏，**When** 用户搜索，**Then** P95 响应 ≤ 200ms
5. **Given** ripgrep 扫 `app/src-tauri/src/commands/search.rs`，**When** 检查，**Then** 0 命中 vibe.db v4_search FTS5 的引用（订阅源 entries 不在本 spec 范围）
6. **Given** 中文混合英文搜索（如「OpenAI 介绍」），**When** 输入，**Then** 正确分词命中（沿用现有 jieba tokenizer 集成）

---

### Edge Cases

- **vault 未初始化**（spec 002 P1 失败）：US1 / US2 / US3 都失败 + 用户可见提示「请先完成 vault 初始化」
- **新建笔记标题为空 / 全 emoji / 特殊字符**：slug 生成走 spec 002 FR-016 规则（中文保留 / emoji 过滤 / 长度限制 / 碰撞加序号）
- **vault `.md` 文件名冲突**（手写 / 之前 ingest）：写入时自动加 `-2` `-3` 后缀
- **NoteEditor 自动保存高频触发**：atomic write + mkdir-mutex 协调（spec 002 vault/locks.rs 已落地）
- **vault 文件夹被外部移动 / rename**：mewmo 启动检测 + 用户可见提示，不创建新空 vault 覆盖原有引用
- **vault 内 `.md` 文件被外部删除**：mewmo 检测后从 list 移除 + 不报错（沿用 spec 002 FR-004 外部改动尊重）
- **剪藏网页失败**（404 / 反爬 / 不可达）：fail-loud 错误提示 + 不留半截 .md
- **搜索关键词触发零结果**：UI 显示「无匹配，看看 [vault 当前内容](vault tab)」+ 不报错
- **vault index 文件损坏 / 不一致**：启动时检测 + 自动重建（一次性扫描 vault markdown 重建 FTS5 表）

---

## Requirements *(mandatory)*

### Functional Requirements

#### 笔记走 vault Markdown（对应 US1）

- **FR-001**: `commands::notes::list_notes` / `get_note` / `create_note` / `update_note` / `delete_note` 必须读写 vault `wiki/notes/*.md`，**禁止**读写 vibe.db 的 notes 表
- **FR-002**: 笔记 `.md` 必须含合法 frontmatter，最少字段：`type=user-note` / `created` / `updated` / `tags`（沿用 spec 002 frontmatter 规范）
- **FR-003**: 笔记的 slug 生成必须遵循 spec 002 FR-016 规则（中文保留 / emoji 过滤 / 长度限制 / 碰撞加 `-2` `-3` 后缀）
- **FR-004**: 笔记编辑保存必须用 atomic rename（沿用 spec 002 FR-007）+ 全局聚合页（如 `wiki/index.md` / `wiki/log.md`）增量 append（沿用 spec 002 FR-008/009）
- **FR-005**: 用户在 Obsidian / VS Code / Finder 编辑 vault 内笔记 `.md` 后，mewmo 必须识别外部改动 + 不覆盖（沿用 spec 002 FR-004）

#### 剪藏走 vault Markdown（对应 US2）

- **FR-006**: `commands::clips::list_clips` / `get_clip` / `save_clip` / `update_clip` / `delete_clip` 必须读写 vault `raw/clips/*.md`，**禁止**读写 vibe.db 的 clips 表
- **FR-007**: 剪藏 `.md` 必须含合法 frontmatter：`type=clip` / `source` / `url` / `site_name` / `saved_at` / `excerpt` / `tags`
- **FR-008**: 剪藏抓取继续走现有 `clip_parser.rs`（693 行 scraper-based 中文站点精调），中文优化字段（公众号 cdn_url_1_1 / 知乎 RichText / IP 属地等）保留在 frontmatter 或正文
- **FR-009**: 剪藏失败（网络错 / 反爬 / 解析挂）必须用户可见错误提示，**禁止**留半截 `.md`（fail-loud + atomic）

#### 全文搜索走 vault Index（对应 US3）

- **FR-010**: `commands::search::search_all` 必须读 vault index（FTS5 over vault markdown，由 vault-meta.db 维护），**禁止**读 vibe.db 的 v4_search FTS5 笔记/剪藏部分
- **FR-011**: vault index 必须支持中文 + 英文混合分词（沿用现有 jieba tokenizer 集成）
- **FR-012**: 1k 篇规模笔记/剪藏，搜索 P95 响应 ≤ 200ms
- **FR-013**: vault `.md` 外部改动后 vault index 必须增量更新（沿用 spec 002 notify-debouncer-full watcher）
- **FR-014**: vault index 损坏 / 不一致时启动自动重建（扫 vault markdown 重建 FTS5 表）

#### 横切（all priorities）

- **FR-015**: 每个 phase commit 后 mewmo 必须在 `pnpm tauri dev` 实测下能启动 + 旧 4 tab UI（笔记 / 剪藏 / 订阅 / 沉淀）功能可用（main 永远可运行 + code-quality.md rule 6.1）
- **FR-016**: 整个改造禁止改 Tauri identifier `com.vibecoding.app`（CLAUDE.md 项目硬规则）
- **FR-017**: Tauri command 名（如 `list_notes` / `save_clip` / `search_all`）签名不变 —— 改在 Rust 实现层，前端组件零改动（沿用 spec 002 思路）
- **FR-018**: 订阅源（`subscriptions` / `entries` 表）继续 SQLite 不动（架构 §7.2 明文，订阅 AI 检索推 spec 004）
- **FR-019**: AIPanel + lib/ai + lib/cat 前端 AI 实现保留不动（推 spec 004 一并搬到 Rust 后端）

#### 不在范围（dogfood 阶段不需要）

- **NFR-A**: **不写任何 migration 代码**——app 直接采用新架构，不在启动时检测 vibe.db 自动迁移
- **NFR-B**: **不写自动备份逻辑**（用户自己懂备份 vault 文件夹 + git）
- **NFR-C**: **不写双读期 / soft-delete / cleanup 推迟**——单用户 dogfood 不需要兼容机制
- **NFR-D**: **不写「一键清空」UI 按钮**——用户用不到
- **NFR-E**: 现有 vibe.db notes / clips 表的数据由**Claude（开发助手）跑一次性脚本搬迁**到 vault markdown（脚本不进 app bundle，是开发动作不是产品功能），搬完直接 SQL drop 老表 —— 这部分是 plan 阶段执行细节不在 spec FR 范围

### Key Entities *(include if feature involves data)*

- **Wiki Note**：`wiki/notes/<slug>.md`，含 frontmatter `type=user-note` / `created` / `updated` / `tags`。本 spec 范围：所有新建 / 编辑 / 删除 / 列表 / 搜索都走这里，**不再走 vibe.db notes 表**
- **Raw Clip**：`raw/clips/<slug>.md`，含 frontmatter `type=clip` / `source` / `url` / `site_name` / `saved_at` / `excerpt` / `tags`。本 spec 范围：同上
- **vault-meta.db**（vault 衍生 SQLite）：spec 002 P1 占位，本 spec 启用 + 加 FTS5 虚拟表 over vault markdown（笔记 + 剪藏的 title / body / tags 索引）
- **vibe.db (legacy SQLite)**：本 spec 范围：notes / clips 表的代码路径全删 + Claude 跑脚本搬数据后 SQL drop 老表；subscriptions / entries 表**不动**

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### 笔记 / 剪藏 vault-first 落地

- **SC-001**: 用户在 mewmo 笔记 tab 新建笔记后，对应 `wiki/notes/<slug>.md` 在 vault 出现的延迟 ≤ 1s（atomic write 完成时）
- **SC-002**: 用户在 mewmo 剪藏网页后，对应 `raw/clips/<slug>.md` 在 vault 出现 + 中文优化字段保留率 100%（公众号 / 知乎 / IP 属地等沿用 clip_parser.rs 现有效果）
- **SC-003**: vault `.md` 用 Obsidian 打开后 frontmatter 不被错误渲染为正文 + 笔记 markdown 渲染正常 + 内嵌图片 / 附件链接可点（沿用 spec 002 SC-001）
- **SC-004**: 100 次 force-quit + 重启编辑测试，**0 起**半截损坏 `.md`（atomic rename 通过标准，沿用 spec 002 SC-006）

#### 搜索性能

- **SC-005**: 1k 篇规模笔记/剪藏全文搜索 P95 响应 ≤ 200ms
- **SC-006**: vault `.md` 外部改动后 vault index 增量更新延迟 ≤ 2s（watcher 触发后）

#### 代码路径清理

- **SC-007**: ripgrep 扫 `app/src-tauri/src/commands/notes.rs` + `app/src-tauri/src/commands/clips.rs` + `app/src/lib/db.ts` 笔记/剪藏部分，**0 命中** SQLite notes / clips 表的 SQL 语句（DROP / SELECT / INSERT / UPDATE / DELETE FROM notes/clips）
- **SC-008**: vibe.db 的 notes 表和 clips 表在 Claude 跑完搬迁脚本后 SQL drop（手工 SQL 操作 + 验证 sqlite3 命令行查不到这两张表）

#### 工程纪律横切

- **SC-009**: 每 phase commit 后 `pnpm tauri dev` 启动成功率 100% + 旧 4 tab UI（笔记 / 剪藏 / 订阅 / 沉淀）全功能可用（main 永远可运行）
- **SC-010**: 整体周期 ≤ 1 周（dogfood 阶段无升级路径兼容机制，规模大幅缩小，应能 5-7 天完成）

---

## Assumptions

### 来自项目阶段事实（已敲定，不重新决策）

- **mewmo 处于 dogfood 单用户阶段**（PRD §13 + [project_dogfood_stage.md](.claude/memory/project_dogfood_stage.md)），所以**不写任何「为他人升级路径设计」的兼容机制**：备份 / 双读 / soft-delete / cleanup 推迟 / migration 代码 / 「一键清空」UI 按钮全砍
- **数据搬迁是开发动作不是产品功能**：Claude 跑一次性脚本读 vibe.db notes/clips → 写 vault markdown → 验证完直接 SQL drop 老表。脚本不进 app bundle
- **本 spec ≠ AI 后端化**：lib/ai + lib/cat + AIPanel 全前端实现保留不动，推独立 spec 004 一并搬到 Rust 后端
- **本 spec ≠ 订阅 AI 检索**：订阅 / 沉淀的数据继续 SQLite + 当前 AI 看不到订阅数据（FTS 没建 + AI tools 没暴露），推 spec 004 跟 AI 后端化一起做

### 来自架构文档 v1.0 的技术决策（已选型，本 spec 不再讨论）

- **三层架构**（架构 §1.2）：本 spec 落 Layer 1（vault.ts ✓ spec 002 已实现） + Layer 2 / 3 留 spec 004
- **真理与衍生分离**（架构 §3.1）：vault `.md` 是真理 / SQLite 是衍生
- **vibe.db / vault-meta.db 边界**（架构 §7.2）：本 spec 让 notes / clips 离开 vibe.db 进 vault；subscriptions / entries 留 vibe.db；vault-meta.db 启用 + 加 FTS 索引

### 来自 mewmo 项目宪法的约束

- **核心 Loop 闭环**（原则 II）：本 spec 完成后笔记 / 剪藏「捕获 + 整理」环节落 vault；激活 / 消费 / 沉淀走原 SQLite + 旧 UI（推 spec 004 改造）
- **30 秒捕获**（原则 III）：本 spec 改造后笔记新建 / 剪藏粘 URL ≤ 30s
- **Vibe coding 安全底线**：本 spec 不涉及 API key（推 spec 004），FR-037 等 API key 安全 FR 不在本 spec 范围

### 工程边界假设

- **测试覆盖**：vault 写路径 + 全文搜索单元测试覆盖率 ≥ 90%（沿用 spec 002 SC-013 vault.ts 100% 覆盖率，新增 search.rs / ingest.rs / query.rs 测试）
- **平台**：v1 仅 macOS；Windows / Linux 通过同一 Tauri 工程出包不在本 spec 验收
- **数据规模**：单用户 vault 1k 篇笔记 + 剪藏（dogfood 期实际数据规模），SC-005 (≤ 200ms) 是当前规模门槛；超过此规模性能假设需重新校准（10k+ 时 incremental index 留 v2）
