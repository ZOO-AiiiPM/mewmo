# Implementation Plan: Vault + Wiki 架构骨架（Phase 0 Foundation）

**Branch**: `feature/vault-wiki` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-vault-wiki-foundation/spec.md`

## Summary

Phase 0 落 mewmo 的「vault + wiki + 猫」三合一架构骨架，让产品的 4 个核心承诺（vault-first / Phase 0 milestone / 猫的灵魂 / agent-native / Tag 自演化）有最小可见证据。**技术方法**：基于已落地的 [docs/02-architecture.md v1.0](../../docs/02-architecture.md) 三层架构（Layer 3 Cat Agent / Layer 2 Skill / Layer 1 vault.ts），实现 Layer 1 IO 层（mutex + atomic rename + frontmatter）+ Layer 2 内置 Skill 包（capture / search / query / lint，capture 完整可用其他 stub）+ Layer 3 cat persona / voice 骨架，跨进程并发由 mkdir-as-mutex 协调。Phase 0 不实现完整 Walking Skeleton 的 query / drill 链（留 Phase 1）、不预先做 embedding / 向量库 / 复杂 RAG。新增依赖共 7 个（Rust 6 + TS 1，已在 [docs/02-architecture.md §2.4](../../docs/02-architecture.md) 选型完毕），其余复用 mewmo 现有代码（marked / sanitizeHtml.ts / clip_parser.rs / FTS5+jieba）。

## Technical Context

**Language/Version**:
- Rust 1.75+（Tauri 2 后端，[app/src-tauri/](../../app/src-tauri/)）
- TypeScript 5（React 前端，[app/src/](../../app/src/)）
- Python 3.11+（外部 Claude Code Skill 脚本运行时；mewmo 内部 Skill 通过 Tauri spawn 子进程）

**Primary Dependencies**:
- Tauri 2 / Vite / React 18 / pnpm（已有）
- 新增 Rust crates：`notify-debouncer-full = "0.7"`、`atomicwrites = "0.4"`、`sanitize-filename = "0.6"`、`gray_matter = "0.3"`、`pulldown-cmark = "0.13"`（仅取 heading 时）、`handlebars = "6.4"`
- 新增 TS 包：`@ai-sdk/anthropic@^3.0.79`（前端 LLM 调用 + cache_control 透传）
- 复用 Rust `tokio::sync::Mutex` / `tokio::process::Command`（零新增）；Mozilla Readability 不引入新 crate（沿用 [clip_parser.rs](../../app/src-tauri/src/clip_parser.rs) 693 行手写 scraper-based 中文精调）
- LLM provider：Anthropic Claude API（默认）；Rust 端用 reqwest 自拼 + trait（拒绝 0.x SDK），前端用 `@ai-sdk/anthropic`
- 详见 [research.md](./research.md) 完整选型理由

**Storage**:
- 真理层：`~/Documents/mewmo-vault/` 下 markdown / 常见格式文件（用户可见、可携带、不可锁定）
- 衍生层：`<vault>/.mewmo/vault-meta.db`（SQLite，feed-stream / activity-log 等）+ `<vault>/.mewmo/logs/<YYYY-MM-DD>.jsonl`（结构化日志）
- 既有 `~/Library/Application Support/com.vibecoding.app/vibe.db`（旧 4 tab 数据继续保留，Phase 0 不迁移）

**Testing**:
- Rust 单元：`cargo test` 跑 vault/io.rs / ingest.rs / query.rs（IO 层覆盖率必须 100%，对应 spec SC-013）
- TS 单元：本次引入 `vitest`（项目目前没有 e2e 框架，新建 vitest.config.ts）
- e2e：手写 `tmp/e2e-test.sh` 跑一遍完整 ingest 链 + 跨进程并发场景（mock LLM 响应）
- 性能 / cache 命中：日志 grep `cache_read_input_tokens` 字段验证（FR-014）
- UI 仍按 mewmo 既有惯例手工验证 + 截图

**Target Platform**: macOS 桌面 App（v1，仅 macOS；Windows / Linux 通过同一 Tauri 工程出包但不在本 spec 验收范围）

**Project Type**: desktop-app（Tauri 2 + React 单仓单项目，代码在 `app/` 子目录）

**Performance Goals**（来自 spec 的 SC，technology-agnostic 见 spec.md）:
- ingest 链 P95 ≤ 30s（SC-003）
- prompt cache 第二次起命中率 ≥ 70%（SC-004，POC-2 数学稳赚区）
- 跨进程 / 双 ingest 链 100 次并发测试 0 起 lost update（SC-005，POC-7 通过标准）
- 强制 kill 50 次 0 起半截 .md（SC-006，atomic rename 通过标准）

**Constraints**:
- 本地优先（不上云、不要登录、不要多用户）
- vault 内任何文件可被外部工具直接读写（不能锁文件 / 不能用私有格式）
- LLM 调用必须经 Tauri Rust 后端代理（API key 不暴露前端）
- 跨进程协作必须用文件系统锁（mkdir-as-mutex），不依赖 mewmo 主进程在线

**Scale/Scope**:
- v1 单 vault 单用户单设备
- vault 文件规模 1k-10k（POC-1 已验证 LLM 直读 1000 页 90% 准确度，无需 embedding）
- LLM 调用频率 ~10-50 次/天（dogfood 个人使用）
- Phase 0 完成意味着 5 user story（37 FR + 15 SC）全部可验收

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> 宪法版本：[v2.0.0](../../.specify/memory/constitution.md)（2026-05-16 ratified）

### 5 核心原则逐项

| # | 原则 | 状态 | 说明 |
|---|------|------|------|
| I | 用户价值优先 | ✅ Pass | 5 个 user story 各对应 PRD 一个核心差异化承诺，每条都能用一句话回答「用户为什么需要它」（spec.md user story 的 "Why this priority" 段已写明）；无任何"工程师视角"功能 |
| II | 核心 Loop 闭环（NON-NEGOTIABLE）| ⚠️ 部分豁免 | 本 spec 完成后 Loop 仅含「捕获 + 整理」骨架，**不含完整闭环**。豁免理由：Phase 0 是架构骨架阶段，Walking Skeleton 整链跑通的责任落在 Phase 1（PRD §12 路线图明确）。豁免在 spec.md Assumptions 段已申明，本次属同一原则**首次**豁免 |
| III | 30 秒捕获 | ✅ Pass | P2（SC-003 ≤30s）+ P4（SC-009 ≤30s）双重满足；ingest 入口 v0 期可以是命令行 / 简易 dev tool，但承诺时间不放宽 |
| IV | Empty State 即引导 | ⚠️ 部分豁免 | Phase 0 期间 React UI 改造范围有限（只动 sidebar 反映新结构），完整 Empty State 引导设计落 Phase 1 walking skeleton spec。豁免理由：Phase 0 没有"用户主用界面"层面的新页面 |
| V | 数据驱动迭代 | ✅ Pass | FR-035 + SC-014 要求所有 LLM 调用 / 文件锁 / Skill 调用 100% 留结构化 JSON 日志（本地 .mewmo/logs/，符合「本地埋点不上报远端」承诺）；spec SC 段全部可量化 |

### Product Scope & Constraints 逐项

- ✅ **平台 macOS 桌面优先**：通过（PRD §10.2 + spec Assumptions 段）
- ✅ **数据本地化 SQLite**：通过（衍生层走 `<vault>/.mewmo/vault-meta.db`）
- ✅ **AI 模型托管不自训**：通过（默认 Anthropic Claude API + Tauri Rust 后端代理；FR-037 要求 API key 不出现前端 / 网络 / 日志）
- ✅ **范围红线**：通过（无登录 / 支付 / 多用户 / 协作 / 移动端 / 浏览器扩展 / 邮件推送）
- ⚠️ **单 feature 1 周内完成** 部分豁免：Phase 0 估时 1.5-2 周（PRD §12），超出宪法 Product Scope 段「单 feature 1 周内」要求。豁免理由：Phase 0 性质是产品级架构骨架不是常规 feature；按 user story 切已经分到 P1-P5 五片，每片实测都能在 1 周内做完；本次属**首次**豁免该约束
- ✅ **签名**：通过（v1 不强制 Apple Developer 签名）

### Development Workflow 逐项

- ✅ **Spec Kit 全流程**：通过（已经过 specify → plan）
- ✅ **CLAUDE.md 单一事实源**：通过（项目硬规则在根 CLAUDE.md，事实在 .claude/memory/，时间线在 journal.md）
- ⚠️ **核心 Loop 演示门槛** 部分豁免：本 spec 完成 Phase 0 骨架不含完整 Loop，无法做"≥1 人非开发者跑通"——豁免落 Phase 1 walking skeleton 兜底（同原则 II 豁免）
- ✅ **Vibe coding 安全底线**：通过（FR-037 + 无前端直调 LLM 设计）
- ⚠️ **GitHub Releases 节奏** 部分豁免：本 spec 完成 P1（vault 文件夹可见）后**不应**打 .dmg release——只有文件夹结构 + 没用户主用功能 = 没法验证 30 秒捕获；release 时机推到 Phase 1 P1 完成（剪藏 + 摘要闭环）
- ✅ **journal 节奏**：通过（已记 spec 创建 entry，Phase 0 各 P 完成 / 踩坑 / 决策都会记）

### 豁免数量小结

本 plan 显式申明**部分豁免 5 项**：原则 II / IV / 1-week constraint / Loop 演示门槛 / Releases 节奏。

按宪法 Governance 段「30 天内同一原则被豁免 ≥2 次时应触发原则修订评审」检查：
- 5 项豁免都是 Phase 0 一次性特殊期触发，**且每项都是首次**，不触发原则修订
- 5 项豁免**根因相同**：Phase 0 是产品级架构骨架阶段，宪法的「单 feature」「完整 Loop 演示」等约束按设计就不适用骨架阶段
- 治理建议：未来如果再有「产品级骨架」spec（如 Phase 6 Skill 生态扩展启动期），同一组豁免会再次出现，**届时**触发原则修订（在宪法补一段「骨架 spec 的特殊豁免规则」）

### Gate 判定

✅ **Constitution Check Pass**：5 项部分豁免都已在本 plan 显式申明 + 在 spec.md / journal.md 留痕，符合宪法 Governance 要求。可进入 Phase 0 research。

## Project Structure

### Documentation (this feature)

```text
specs/002-vault-wiki-foundation/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出（架构调研提炼）
├── data-model.md        # Phase 1 输出（vault 内所有 .md 的 schema）
├── quickstart.md        # Phase 1 输出（开发者从零跑通 P2 milestone）
├── contracts/           # Phase 1 输出
│   ├── tauri-commands.md      # vault.* / ingest.* / cat.* / skill.* Tauri commands
│   ├── skill-protocol.md      # ~/.claude/skills/mewmo/ 接口（capture/search/query/lint）
│   └── vault-io-trait.md      # Layer 1 IO trait（Rust trait + Python 等价接口）
├── checklists/
│   └── requirements.md  # spec 阶段已落地的 quality check
├── spec.md              # 已落地（specify 阶段）
└── tasks.md             # Phase 2 输出（/speckit-tasks 命令产出，本命令不创建）
```

### Source Code (现有 Tauri 工程内)

> mewmo 是单仓 Tauri 2 项目，**代码在 `app/` 子目录不在仓库根**。本 spec 的产物全部进 `app/` 内既有结构 + 必要的新子目录。

```text
app/                                  # Tauri 2 单仓（仅此目录被 git track）
├── src/                              # React 前端（TS）
│   ├── components/                   # 既有：NoteList / ClipReader / EntryReader / TabBar 等
│   │   └── vault/                    # 新增：vault tab UI 骨架（小，仅 sidebar 反映三层结构）
│   ├── lib/
│   │   ├── vault.ts                  # 新增：Layer 1 IO 接口前端封装（invoke wrapper）
│   │   ├── frontmatter.ts            # 新增：gray-matter npm 包装
│   │   ├── sanitizeHtml.ts           # 已有：复用
│   │   ├── parseHeadings.ts          # 已有：复用
│   │   ├── dateBuckets.ts            # 已有：复用
│   │   ├── attachments.ts            # 已有：复用
│   │   └── tauriCall.ts              # 已有：复用 invoke wrapper
│   └── ...
│
├── src-tauri/                        # Rust 后端
│   ├── src/
│   │   ├── lib.rs                    # 既有：generate_handler! 注册新 vault commands
│   │   ├── db.rs                     # 既有：vibe.db migrations 不动
│   │   ├── clip_parser.rs            # 既有：693 行中文精调，复用
│   │   ├── vault/                    # 新增模块
│   │   │   ├── mod.rs                # vault module 入口
│   │   │   ├── io.rs                 # FR-007/008/009：mutex + atomic rename + 增量 append
│   │   │   ├── frontmatter.rs        # gray_matter 包装
│   │   │   ├── slug.rs               # FR-016：sanitize-filename + 中文保留 + 碰撞处理
│   │   │   ├── ingest.rs             # FR-011~016：ingest 链调度
│   │   │   ├── query.rs              # 仅 stub（Phase 1 才实装）
│   │   │   ├── locks.rs              # FR-010：mkdir-as-mutex 跨进程锁实现
│   │   │   └── meta_db.rs            # vault-meta.db schema + migrations（占位）
│   │   ├── llm/
│   │   │   ├── mod.rs                # provider trait 抽象
│   │   │   ├── anthropic.rs          # reqwest 直连 + cache_control + 流式
│   │   │   └── log.rs                # FR-035：JSON line 日志
│   │   ├── cat/
│   │   │   ├── mod.rs                # cat agent 编排
│   │   │   ├── persona.rs            # FR-018：每次重读 persona.md
│   │   │   └── voice.rs              # voice-template.md 注入
│   │   └── skill_runner.rs           # FR-022~028：spawn 子进程跑 Skill 脚本（内部猫 + 外部共用）
│   ├── skills/                       # 新增：Skill 实现源（打包进 app bundle）
│   │   ├── SKILL.md                  # 入口
│   │   ├── capture/
│   │   │   ├── SKILL.md
│   │   │   └── scripts/capture.py    # FR-024 完整实现
│   │   ├── search/SKILL.md           # stub
│   │   ├── query/SKILL.md            # stub
│   │   ├── lint/SKILL.md             # stub
│   │   └── _shared/
│   │       └── vault.py              # Python 端 Layer 1 IO（含 mkdir-mutex）
│   ├── capabilities/
│   │   └── default.json              # 既有：Phase 0.2 收紧 CSP（架构文档 §7.3）
│   ├── tauri.conf.json               # 既有
│   └── Cargo.toml                    # 加 6 个新 crate
│
├── package.json                      # 加 @ai-sdk/anthropic + vitest
└── vitest.config.ts                  # 新增（项目首引入）
```

**部署目标（vault 在用户磁盘，Skill 包到 Anthropic 标准位置）**：

```text
~/Documents/mewmo-vault/              # 用户可见 vault（首次启动后由 mewmo 创建）
├── raw/
│   ├── _index.md
│   ├── clips/
│   ├── feeds-archived/
│   ├── images/
│   └── files/
├── wiki/
│   ├── _index.md
│   ├── index.md                      # 全局聚合页（mutex 热点）
│   ├── log.md                        # append-only 时间线
│   ├── notes/
│   ├── entities/
│   ├── topics/
│   ├── reports/{daily,weekly}/
│   ├── cat-diary/
│   └── todos/{active,done}/
└── .mewmo/                           # 隐藏
    ├── vault-meta.db                 # 衍生 SQLite
    ├── logs/<YYYY-MM-DD>.jsonl       # 结构化日志
    ├── .locks/                       # mkdir-mutex
    ├── tags/
    │   ├── _index.md                 # FR-029~033
    │   └── *.md                      # 1-2 个示例 supertag
    └── cat/
        ├── persona-{curious,gentle,sharp,casual,steady}.md  # FR-017
        ├── voice-template.md
        ├── active.txt                # 当前 active persona id
        └── memory/
            ├── about-user.md
            ├── recent-focus.md
            └── threads/

~/.claude/skills/mewmo/               # Anthropic 标准位置（首次启动 / 升级时由 mewmo 同步）
├── SKILL.md
├── capture/SKILL.md + scripts/
├── search/SKILL.md
├── query/SKILL.md
├── lint/SKILL.md
└── _shared/vault.py
```

**Structure Decision**:
- **复用 mewmo 既有 single-project 结构**（Tauri 2 + React + Rust，所有代码在 `app/` 子目录），不切换到多项目 / 多包结构
- **vault.ts / vault.py 双语言共享 IO 层**（架构文档 §1.5）：Tauri 后端 Rust 实现 + Skill 脚本 Python 实现写**同一份 vault 文件夹**，跨进程靠 mkdir-as-mutex 协调
- **Skill 实现源在 `app/src-tauri/skills/`**（打包进 app bundle），首次启动 / 升级时复制部署到 `~/.claude/skills/mewmo/`（FR-022 / FR-027）
- **新增模块在 `vault/` `llm/` `cat/` 三个 Rust 子模块**：明确 Layer 1/2/3 分层
- **不新建独立 Cargo workspace**：mewmo 是单 crate，新模块直接进 src-tauri/src/

## Complexity Tracking

> 5 项 Constitution Check 部分豁免对应的复杂度说明

| 违反项 | 为什么需要 | 简化方案被否决的理由 |
|--------|-----------|---------------------|
| 原则 II 完整 Loop（部分豁免） | Phase 0 是产品级架构骨架，没有「捕获 + 整理 + 激活 + 消费 + 沉淀」5 段全跑的责任 | 简化方案 = 把 Phase 0 + Phase 1 合并成一个 spec → 6+ 周开发量 → spec 审阅 / clarify / plan / tasks 流程都吃力，不如分两段 spec 各自落 |
| 原则 IV Empty State（部分豁免） | Phase 0 期间 React UI 改造范围有限（只动 sidebar），没有"用户主用界面"层面的新页面 | 简化方案 = Phase 0 同时设计完整 React vault UI → 增加 1+ 周工作量 + 阻塞核心架构落地 |
| 单 feature 1 周内（部分豁免） | Phase 0 性质是产品级架构骨架（vault.ts + cat persona + Skill + Tag + 跨进程锁同时落地），不是常规 feature | 简化方案 = Phase 0 拆 5 个独立 spec（每 user story 一个） → 5 个 spec 之间技术耦合度极高，独立 plan 会大量重复 + 集成 risk 反而上升 |
| Loop 演示门槛（部分豁免） | 见原则 II（同根因） | 同上 |
| Releases 节奏（部分豁免） | 没有用户主用功能，打 .dmg 也没法验证「30 秒捕获」承诺 | 简化方案 = Phase 0 P1 完成强行打 release → 给 dogfooder 一个空 vault → 反指标（用户失望、打负分），不如延到 Phase 1 P1 |

**根因总结**：5 项部分豁免的根本原因是同一个——**Phase 0 是产品级架构骨架，宪法的「单 feature」「完整 Loop 演示」等约束按设计不适用骨架阶段**。Phase 1 walking skeleton spec 的 plan 阶段会把这些豁免转成正常通过（届时 5 段 Loop 全跑通、有用户主用界面、可打 release）。
