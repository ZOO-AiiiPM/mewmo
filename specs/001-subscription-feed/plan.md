# Implementation Plan: 订阅区（Subscription Feed Zone）

**Branch**: `001-subscription-feed` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-subscription-feed/spec.md`

## Summary

订阅区是 vibe-coding v1 的第四个 zone（Sidebar 已预留 `Zone='subscribe'`），让用户订阅外部 RSS / Atom 源、定期抓取更新、按双栏视图（Source list + Entry list + Reader）阅读。公众号 / X / YouTube 等非标准源通过用户自部署的桥接服务（推荐 we-mp-rss）输出 RSS URL 后接入——vibe-coding 不下场爬腾讯，不内嵌 AGPL 代码。后端用 `feed-rs` 解析 + `reqwest` 抓取（已有），调度采用"app 启动时检查 + 用户手动按钮"，每天最多抓 1 次。

## Technical Context

**Language/Version**: Rust 1.77.2（Tauri 后端，已定）+ TypeScript 5（前端，Vite + React 19）
**Primary Dependencies**:
- 后端新增：`feed-rs = "2"`（RSS / Atom / JSON Feed 统一解析）
- 后端已有：`reqwest 0.12`、`serde / serde_json`、`tauri-plugin-sql 2.4`、`tokio`（随 Tauri 入）、`scraper 0.22`、`log`
- 前端复用：`react 19`、`@tauri-apps/api 2.11`、`@tauri-apps/plugin-sql 2.4`、`tailwindcss 4`、`marked`（reader Markdown 渲染）

**Storage**: 本地 SQLite via `tauri-plugin-sql`，复用 `~/Library/Application Support/com.vibecoding.app/vibe.db`。新增两张表：`subscription_sources` + `feed_entries`（详见 `data-model.md`）

**Testing**: `cargo test`（Rust 单元 + 集成）；前端暂无 test framework（项目级一致）；契约层用 quickstart.md 手动验收

**Target Platform**: macOS 桌面（Tauri 2，arm64 + x64），Win/Linux 在 v2 通过同一 Tauri 工程出包

**Project Type**: Desktop app（不是 web service，无 backend/frontend 分库；前后端在同一 Tauri 工程内）

**Performance Goals**:
- 启动后 batch fetch 50 源 < 60s（串行 + ETag/304 + MD5 hash）
- 订阅区列表渲染 < 200ms（5000 entries 量级）
- 离线阅读即时（数据全本地）
- 单源抓取超时 30s（reqwest timeout）

**Constraints**:
- 离线可读（已抓取内容必须能读）
- 不引入新存储层（复用 sqlite）
- 不内嵌 AGPL 代码（research-wechat-mp.md 已论证）
- 抓取逻辑不阻塞 UI（tokio 异步任务 + 前端 invoke 等待）

**Scale/Scope**: v1 目标 50 源 / 5000 entries / 单用户单机；超过 100 源再加 `tokio::Semaphore` 限并发

## Constitution Check

*GATE: 必须在 Phase 0 research 前通过。Phase 1 设计完后复查。*

| 原则 | 检查 | 结论 |
|---|---|---|
| **I. 用户价值优先** | 订阅 = 核心价值"信息从被动收集到主动激活"的捕获环节，spec.md 已写明 user story 驱动 | ✅ 通过 |
| **II. 核心 Loop 闭环（NON-NEGOTIABLE）** | 本期完成"捕获（订阅 + 抓取）+ 消费（阅读）"，"整理 / 激活 / 沉淀"依赖后续 AI 加工层 spec | ⚠️ **部分**（见 Complexity Tracking） |
| **III. 30 秒捕获** | spec.md SC-001 规定"60 秒内完成添加第一个源"。30 秒上限为新用户**首次启动到第一次价值动作**——订阅区不影响首次价值（用户可以先用笔记 / 剪藏） | ✅ 通过 |
| **IV. Empty State 即引导** | 原型已设计 empty state（推荐 → "添加第一个订阅源"按钮 + 公众号桥接 onboarding） | ✅ 通过 |
| **V. 数据驱动迭代** | spec.md SC-001 ~ SC-007 已定指标，但**本地埋点（events 表）需在 tasks 阶段补** | ⚠️ **补丁**（见 Complexity Tracking） |

## Project Structure

### Documentation (this feature)

```text
specs/001-subscription-feed/
├── spec.md                    # ✅ Ready for Plan
├── plan.md                    # ← 本文件
├── research.md                # Phase 0 整合（引用 research-backend.md / research-wechat-mp.md）
├── research-backend.md        # ✅ 已有（后端技术方案）
├── research-wechat-mp.md      # ✅ 已有（公众号集成方案）
├── data-model.md              # Phase 1：schema + entities
├── contracts/                 # Phase 1：Tauri command 契约
│   └── tauri-commands.md
├── quickstart.md              # Phase 1：开发者快速上手 + 验收脚本
├── checklists/
│   └── requirements.md        # ✅ 已有（spec quality）
└── tasks.md                   # Phase 2 by /speckit-tasks
```

### Source Code (repository root)

```text
app/                            # Tauri 工程根（已有）
├── src-tauri/
│   ├── Cargo.toml             # 加 feed-rs = "2"
│   ├── src/
│   │   ├── lib.rs             # 既有 Tauri command 入口；本 feature 在此追加 commands + module 导入
│   │   └── subscription/      # ★ 新增模块
│   │       ├── mod.rs         # pub use 导出
│   │       ├── adapter.rs     # trait FetchAdapter + RssAtomAdapter impl
│   │       ├── scheduler.rs   # 启动检查 + 手动 batch fetch
│   │       ├── store.rs       # sqlite CRUD（subscriptions / entries）
│   │       └── commands.rs    # Tauri commands：add_subscription / list_sources / refresh_all 等
│   └── migrations/             # 既有 migrations 在 lib.rs 内联，本 feature 沿用同模式追加
└── src/
    ├── components/
    │   ├── SubscriptionLayout.tsx  # ★ 新增：三栏容器
    │   ├── SourceList.tsx          # ★ 新增：左栏 source 列表（参照 NoteList）
    │   ├── EntryList.tsx           # ★ 新增：中栏 entry 列表（参照 NoteList 分桶 + sticky bucket header）
    │   ├── EntryReader.tsx         # ★ 新增：右栏阅读器（参照 ClipReader）
    │   ├── AddSourceDialog.tsx     # ★ 新增：添加源 modal（含公众号 onboarding）
    │   ├── SourceManageView.tsx    # ★ 新增：源管理列表
    │   ├── App.tsx                 # 改：activeZone === 'subscribe' 分支挂载 SubscriptionLayout
    │   ├── Sidebar.tsx             # 不动（subscribe icon 已存在）
    │   └── TabBar.tsx              # 改：tab refId 支持 source/entry 复合 ref
    ├── lib/
    │   └── subscription.ts         # ★ 新增：前端 invoke 封装（参照 lib/db.ts）
    └── types.ts                    # 改：加 SubscriptionSource / FeedEntry 类型
```

**Structure Decision**: 单 Tauri 工程（app/）内扩展，不新增子项目。后端按"模块 = 目录 + mod.rs"的标准 Rust 组织（`src-tauri/src/subscription/`），前端组件参照 note 区的 file-per-component 模式（`SourceList.tsx` ↔ `NoteList.tsx`）。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **核心 Loop 在本 spec 内不闭环（缺整理 / 激活 / 沉淀）** | 把 AI 加工层（摘要 / 关联 / 主动推送）和"订阅基础闭环（订阅 → 抓取 → 阅读）"绑成一个 spec，会让低风险技术（feed-rs + sqlite，稳定）被高风险技术（LLM 调用 / prompt 工程）拖死。Q3 决策已选择"AI 加工层独立 spec" | 一次做完 = 上线时间不可控（LLM 模块开发周期 +3-5 周）；同时 reader 区已设计"保存到沉淀"按钮——用户可手动完成沉淀环节，把闭环张力降到可接受 |
| **本 spec 缺埋点（events 表 + 关键动作埋点）** | 宪法 V 条要求每个新功能配本地埋点。本期 spec.md 关注用户价值闭环，未定义埋点字段——属 plan/tasks 阶段补足 | 提前在 spec 写埋点 = 过早设计；tasks 阶段补的埋点能基于实际实现的事件名（add_source / fetch_success / fetch_fail / open_entry / mark_unhealthy 等）更精确 |
