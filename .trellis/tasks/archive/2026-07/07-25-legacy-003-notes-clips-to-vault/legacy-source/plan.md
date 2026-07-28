# Implementation Plan: 笔记 / 剪藏切到 Vault Markdown（Phase 0 续）

**Branch**: `feature/vault-wiki` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-notes-clips-to-vault/spec.md`

## Summary

接续 [spec 002 vault-wiki-foundation](../002-vault-wiki-foundation/) 已落地的 Layer 1 vault IO，本 spec **让 mewmo 的笔记 / 剪藏数据归 vault markdown**——把 `commands::notes::*` 和 `commands::clips::*` 的实现从 vibe.db SQLite 切到 vault `wiki/notes/` / `raw/clips/` markdown 文件，把 `commands::search::search_all` 切到 vault index（FTS5 over vault markdown + jieba tokenizer）。**前端 Tauri command 名签名不变**，UI 组件零改动。**dogfood 单用户阶段不写任何 migration 代码 / 备份 / 双读 / soft-delete / cleanup 保险机制**——现有 vibe.db 笔记/剪藏数据由 Claude 跑一次性搬迁脚本（不进 app bundle）+ 验证完直接 SQL drop 老表。AIPanel + lib/ai + lib/cat 前端 AI 实现保留不动（推 spec 004）。订阅源（subscriptions / entries 表）继续 SQLite 不动（架构 §7.2）。

## Technical Context

**Language/Version**:
- Rust 1.75+（Tauri 2 后端，沿用 spec 002 已选型）
- TypeScript 5（React 前端，沿用）

**Primary Dependencies**：本 spec **不新增** Rust crate / TS 包，全部沿用 spec 002 已装（`atomicwrites = "0.4"` / `sanitize-filename = "0.6"` / `gray_matter = "0.3"` / `notify-debouncer-full = "0.7"` / `handlebars = "6.4"` / `pulldown-cmark = "0.13"` / `rusqlite` / `tokio` / 等）。详见 [spec 002 plan §2.4](../002-vault-wiki-foundation/plan.md)。

**Storage**：
- 真理：vault `wiki/notes/*.md` + `raw/clips/*.md`
- 衍生：`<vault>/.mewmo/vault-meta.db`（FTS5 虚拟表 over vault markdown，由 spec 002 vault watcher 增量维护）
- 旧 vibe.db：notes / clips 表 SQL drop（Claude 跑搬迁脚本 + 验证完后手工执行）；subscriptions / entries 保留

**Testing**：
- Rust 单元：`cargo test` 跑 `vault::ingest` / `vault::query` / `vault::search` / `commands::notes` / `commands::clips` / `commands::search`
- TS 单元：vitest（spec 002 引入）跑 `lib/db.ts` notes/clips wrapper 行为不变
- e2e：手写 `tmp/e2e-test.sh` 跑笔记 / 剪藏 / 搜索全链路（mock LLM）
- UI 仍走手工验证 + 截图（项目惯例）

**Target Platform**: macOS 桌面 App

**Project Type**: desktop-app（Tauri 2 + React 单仓单项目，沿用 spec 002 单 `app/` 子目录）

**Performance Goals**：
- 笔记新建 → vault `.md` 出现 ≤ 1s（SC-001）
- 全文搜索 P95 ≤ 200ms（SC-005）
- vault 外部改动 → index 增量更新 ≤ 2s（SC-006）

**Constraints**：
- 本地优先（不上云、不要登录、不要多用户）
- 单用户 dogfood 阶段（不写任何兼容机制）
- Tauri command 名签名不变（实现层切换）
- main 永远可运行 + 每 phase commit 后 dev 可跑（沿用 mewmo 项目硬规则）

**Scale/Scope**:
- v1 单 vault 单用户单设备
- 当前规模 1k 篇笔记 + 剪藏；FTS index 增量维护
- 估时：5-7 天（dogfood 阶段无升级路径兼容机制，规模小）
- 整体 user story 数：3（P1 笔记 / P2 剪藏 / P3 搜索）+ 19 FR + 10 SC

## Constitution Check

> 宪法版本：[v2.0.0](../../.specify/memory/constitution.md)（2026-05-16 ratified）

### 5 核心原则逐项

| # | 原则 | 状态 | 说明 |
|---|------|------|------|
| I | 用户价值优先 | ✅ Pass | 3 user story 各对应 PRD vault-first 承诺，每条带 Why this priority |
| II | 核心 Loop 闭环（NON-NEGOTIABLE）| ⚠️ 部分豁免 | 本 spec 改 Loop 中「捕获 + 整理」环节让笔记/剪藏归 vault；激活/消费/沉淀仍走原 SQLite/旧 UI（推 spec 004）。豁免根因同 spec 002——分阶段把 Loop 全段升级到 vault-first |
| III | 30 秒捕获 | ✅ Pass | 改造后笔记新建 / 剪藏粘 URL ≤ 30s（command 名签名不变，UI 路径不退化） |
| IV | Empty State 即引导 | ✅ Pass | 本 spec 不改 UI（接口不变实现切换），4 tab UI 现有空状态保留 |
| V | 数据驱动迭代 | ✅ Pass | 沿用 spec 002 结构化 JSON 日志框架（`<vault>/.mewmo/logs/`） |

### Product Scope & Constraints 逐项

- ✅ 平台 macOS 桌面优先（沿用 spec 002 决策）
- ✅ 数据本地化 SQLite + 文件系统（vault-meta.db 衍生 + vault markdown 真理）
- ✅ AI 模型托管不自训（本 spec 不涉新 AI 调用，推 spec 004）
- ✅ 范围红线（无登录 / 支付 / 多用户 / 协作 / 移动端 / 浏览器扩展 / 邮件推送）
- ✅ **单 feature 1 周内**：本 spec 估时 5-7 天，**不豁免**（dogfood 简化使规模能扛 1 周内）
- ✅ 签名 v1 不强制

### Development Workflow 逐项

- ✅ Spec Kit 全流程：已 specify → 当前 plan
- ✅ CLAUDE.md 单一事实源
- ⚠️ 核心 Loop 演示门槛 **部分豁免**：根因同原则 II
- ✅ Vibe coding 安全底线（本 spec 不涉新 AI 调用，FR-37 等留 spec 004）
- ⚠️ GitHub Releases 节奏 **部分豁免**：dogfood 阶段不强求外部 release，本 spec 完成可内部 dogfood 验证
- ✅ journal 节奏

### 豁免数量小结

本 plan 显式申明**部分豁免 3 项**：原则 II / Loop 演示门槛 / Releases 节奏。3 项同根因——本 spec 是 Loop 中段改造，不动激活/消费/沉淀环节，待 spec 004。同 spec 002 同模式同根因首次豁免，**不触发宪法修订**（治理段「30 天内同一原则被豁免 ≥2 次时应触发原则修订评审」当前仅 spec 002 + 003 两次同根因豁免，未到阈值；spec 004 plan 阶段时如再同根因豁免则评审）。

### Gate 判定

✅ **Constitution Check Pass**：3 项部分豁免显式申明 + 同 spec 002 模式 + 0 NEEDS CLARIFICATION。可进 Phase 0 research。

## Project Structure

### Documentation (this feature)

```text
specs/003-notes-clips-to-vault/
├── plan.md              # 本文件（/speckit-plan 命令产出）
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── checklists/
│   └── requirements.md  # spec 阶段已落地
├── spec.md              # 已落地（specify 阶段）
└── tasks.md             # Phase 2 输出（/speckit-tasks 命令产出，本命令不创建）
```

> **Skip contracts/**：本 spec Tauri command 签名不变（FR-017），仅切换实现层；无新 external interface 要 contract。沿用 [spec 002 contracts/tauri-commands.md](../002-vault-wiki-foundation/contracts/tauri-commands.md) 已定的 vault_* 接口契约。

### Source Code (现有 Tauri 工程内)

> 沿用 spec 002 single-project 结构，所有代码在 `app/` 子目录。

```text
app/
├── src/                              # React 前端（TS）
│   ├── lib/
│   │   ├── db.ts                     # 改造：notes/clips wrapper 改 invoke vault_*（接口签名不变）
│   │   ├── vault.ts                  # 沿用 spec 002 + 新增 listNotes / saveNote / 等高层 API
│   │   └── ...                       # 其他沿用
│   └── components/                   # 零改动（接口不变 = UI 不感知）
│
├── src-tauri/                        # Rust 后端
│   ├── src/
│   │   ├── lib.rs                    # 沿用 generate_handler!（Tauri command 名不变）
│   │   ├── db.rs                     # 改造：v7 migration drop notes/clips（保留 subscriptions）
│   │   ├── commands/
│   │   │   ├── notes.rs              # 改造：实现层从 db.rs SQLite 切到 vault::ingest+query
│   │   │   ├── clips.rs              # 同上
│   │   │   ├── search.rs             # 改造：从 vibe.db v4_search FTS5 切到 vault-meta.db FTS5
│   │   │   ├── subscriptions.rs      # 不动
│   │   │   └── vault.rs              # 沿用 spec 002（vault_initialize / vault_get_config / etc）
│   │   ├── vault/
│   │   │   ├── io.rs                 # ✓ spec 002 已实现
│   │   │   ├── ingest.rs             # 新建：write_note / write_clip 高层 API
│   │   │   ├── query.rs              # 新建：list_notes / get_note / list_clips / get_clip 高层 API
│   │   │   ├── search.rs             # 新建：FTS5 builder + 查询 over vault markdown
│   │   │   └── meta_db.rs            # 沿用 spec 002 + 新增 FTS5 schema migration
│   ├── migrations/
│   │   ├── v6_subscription.sql       # 不动
│   │   ├── v7_drop_notes_clips.sql   # 新增：drop notes / clips + 删 v4_search 笔记/剪藏部分
│   │   └── ...
│   └── Cargo.toml                    # 不动（无新增依赖）
│
└── package.json                      # 不动

# 开发动作（不进 app bundle，gitignore）
tmp/
├── migrate-notes-clips-to-vault.py   # Claude 跑一次性搬迁脚本
└── e2e-test.sh                       # 笔记/剪藏/搜索全链路 e2e
```

**Structure Decision**:
- 沿用 spec 002 single-project 结构，所有产品代码在 `app/` 子目录
- **Tauri command 名签名不变** —— 改在 Rust 实现层，前端零改动
- 一次性搬迁脚本放 `tmp/`（gitignore，不进 app bundle，是开发动作不是产品）
- 不新建 Rust crate / npm 包（无新增依赖）

## Complexity Tracking

> 3 项 Constitution Check 部分豁免对应的复杂度说明

| 违反项 | 为什么需要 | 简化方案被否决的理由 |
|--------|-----------|---------------------|
| 原则 II 完整 Loop（部分豁免）| 本 spec 是 Loop 中段改造（捕获 / 整理 → vault），不含激活 / 消费 / 沉淀的 vault 化（推 spec 004 AI 后端化 + 订阅 AI 检索）| 简化方案 = 把 spec 003 + 004 合并成一个 spec → 11 user story + 47 FR + 25 SC，complexity 爆炸 + 数据迁移耦合 AI 后端化使 spec 失去焦点 |
| Loop 演示门槛（部分豁免）| 根因同原则 II | 同上 |
| Releases 节奏（部分豁免）| dogfood 阶段不强求外部 release，本 spec 完成内部 dogfood 验证就够 | 简化方案 = 本 spec P1 完成强行打 release → 给 dogfooder 看「数据归 vault 但 AI 还前端」的中间状态，反指标（用户困惑、负反馈），不如等 spec 004 完后整体 release |

**根因总结**：3 项部分豁免根因相同——本 spec 是 Loop 中段改造，dogfood 阶段无强 release 压力。spec 004 plan 阶段会把这些豁免转成正常通过（届时 Loop 全段 vault 化 + AI 后端化 + 订阅 AI 检索 + 可打 release）。
