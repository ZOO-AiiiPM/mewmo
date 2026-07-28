# Implementation Plan: 全局搜索 + 标签管理

**Branch**: `001-search-tags` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)

## Summary

为 vibe-coding 笔记 / 剪藏 app 加全局搜索 + 标签管理。技术核心：把 SQL 后端从 `tauri-plugin-sql`（sqlx）切换到 `rusqlite + bundled`，注册 `jieba-rs` 自定义中文分词器到 SQLite FTS5 上，配 bm25 加权（标题 5 / 标签 3 / 正文 1）+ 时间衰减排序。一次 migration 落齐 FTS5 + 标签 schema 避免后续重建索引。LIKE fallback 兜底新词漏切。

## Technical Context

**Language/Version**: Rust 1.77+, TypeScript 5.x
**Primary Dependencies**: `rusqlite 0.31 (bundled)`, `jieba-rs 0.7`, `once_cell 1.x`, Tauri 2.11
**Storage**: SQLite + FTS5（contentless shadow 模式，节省一半空间）
**Testing**: Rust unit tests（migration / tokenizer / search）+ 前端 visual smoke test
**Target Platform**: macOS Tauri 2 desktop（≥ macOS 12）
**Project Type**: desktop-app（单 Tauri 工程，Rust 后端 + React 前端）
**Performance Goals**: 99% 搜索请求 ≤ 100 ms（1k 笔记 + 500 剪藏数据规模）
**Constraints**: 必须支持 ≤ 2 字中文短词搜索（SC-001 ≥ 95% 召回率），无云端、无远端 API
**Scale/Scope**: 万级笔记 + 千级剪藏 + 百级标签（v1 数据规模上限）

## Constitution Check

*GATE: Phase 0 前必须通过；Phase 1 设计完后再次校核。*

| 原则 | 评估 | 备注 |
|---|---|---|
| **I. 用户价值优先** | ✓ | 搜索（消费 / 找回）+ 标签（整理）服务"信息激活"；spec 中每条 FR 都有用户行为映射 |
| **II. 核心 Loop 闭环** | ✓ | 本 feature 在 Loop 中位置：**整理（标签）** + **消费（搜索）**；不破坏现有捕获 / 沉淀环节，为未来"激活"环节（AI 主动推送）预备索引基础 |
| **III. 30 秒捕获** | ✓ | 不影响首次捕获路径（搜索 / 标签是已捕获后才用的能力） |
| **IV. Empty State 即引导** | ⚠ | 4 处空状态需在实现层应对（搜索框无输入 / 0 结果 / 标签云空 / 标签详情空），写入 `quickstart.md` 验收清单 |
| **V. 数据驱动迭代** | ⚠ | v1 暂不埋点（搜索词 / 命中数 / 标签创建）；schema 不预留 events 表，留至 v1.1。tasks 阶段标"埋点延后"任务 |

**Gate Result**: ✓ 通过。两个软偏离（IV / V）已通过实施层面应对，无 violation 进入 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/001-search-tags/
├── spec.md              # ✓ 用户视角需求（已完成）
├── plan.md              # ✓ 本文件
├── research.md          # ✓ Phase 0：技术选型调研结论
├── data-model.md        # ✓ Phase 1：数据模型 + schema
├── quickstart.md        # ✓ Phase 1:上手验收清单
├── contracts/           # ✓ Phase 1：12 个 tauri commands 契约
│   ├── notes-clips.md
│   ├── search.md
│   └── tags.md
└── tasks.md             # 待 Phase 2 (/speckit-tasks) 生成
```

### Source Code Structure（增量到现有项目）

```text
app/
├── src-tauri/
│   ├── Cargo.toml                   # 改：去 tauri-plugin-sql，加 rusqlite + jieba-rs + once_cell
│   ├── src/
│   │   ├── lib.rs                   # 改：去掉 plugin_sql migrations，初始化 rusqlite db state
│   │   ├── main.rs                  # 不动
│   │   ├── db.rs                    # 新：rusqlite Mutex<Connection> + 初始化 + migrations 执行
│   │   ├── tokenizer.rs             # 新：jieba-rs 自定义 FTS5 tokenizer（unsafe extension ~50 行）
│   │   ├── commands/                # 新：拆分 #[tauri::command]
│   │   │   ├── mod.rs
│   │   │   ├── notes.rs             # 4 个：list_notes / create_note / update_note / delete_note
│   │   │   ├── clips.rs             # 4 个：list_clips / save_clip / delete_clip / update_clip
│   │   │   ├── search.rs            # 1 个：search_all
│   │   │   └── tags.rs              # 5 个：list_tags / set_note_tags / set_clip_tags / rename_tag / delete_tag
│   │   └── migrations/
│   │       └── v4_search_tags.sql   # 新：FTS5 + tags + 触发器一次落齐
└── src/
    ├── lib/
    │   └── db.ts                    # 改：8 原函数全改 invoke<T>(...)，新增 4 个 search/tag 函数
    └── components/
        ├── SearchResults.tsx        # 新：搜索结果分组视图
        ├── TagPicker.tsx            # 新：# 触发的标签输入器
        ├── TagBrowser.tsx           # 新：标签云 / 列表
        └── TagDetailView.tsx        # 新：某标签下所有笔记 + 剪藏混合视图
```

**Structure Decision**: 单 Tauri desktop project。Rust 后端拆 `db.rs / tokenizer.rs / commands/` 模块（原 lib.rs 已 200+ 行，拆模块对维护友好）；前端在现有 `src/` 下增量加 4 个组件 + db.ts 改造。不引入新工程 / 子项目。

## Implementation Slices（渐进切片，每片 commit 后 app 仍可跑）

| 切片 | 改动 | 验收 |
|---|---|---|
| **A. DB 后端切换** | Cargo.toml 去 tauri-plugin-sql 加 rusqlite；写 db.rs + 8 个 invoke command 同 ABI；保持现有 schema 不动 | app 启动正常，笔记 / 剪藏 CRUD 全部可用，重启后数据持久 |
| **B. jieba + FTS5 表** | 加 tokenizer.rs 注册 jieba；migration v4 加 FTS5 表 + 触发器 + backfill | DB 里 FTS 表有数据但前端无 UI 暴露；`SELECT count(*) FROM notes_fts` = `SELECT count(*) FROM notes` |
| **C. 搜索 API + UI** | search_all command + 前端 SearchResults 视图；Sidebar 输入框接 onChange + debounce 200ms | 能搜笔记 / 剪藏，看到分组结果 + `<mark>` 高亮 + 32 字 snippet |
| **D. 标签 schema** | tags / note_tags / clip_tags 表 + tags_text 派生字段 + 触发器同步 | DB 层标签可写读，无前端暴露；调 set_note_tags 后 notes_fts 命中 |
| **E. 标签 UI** | NoteEditor / ClipReader 加 # picker + TagBrowser 标签云 + TagDetailView | 加 / 改 / 删 / 浏览标签全部 work；点标签进详情视图 |

按 `~/.claude/rules/execution.md` 「大功能拆成可运行切片」原则。每切片独立 commit，`feature/notes` 主线不挂。

## Risks & Mitigations

| 风险 | 缓解 |
|---|---|
| jieba 自定义 tokenizer 实现复杂（unsafe Rust） | 参考 inkdown（github.com/shoushuidianfei/inkdown）的 `tokenizer.rs` 作 anchor，控制在 ~50 行 |
| FTS5 触发器级联损坏（"database disk image is malformed"） | 触发器**必须**写 `AFTER UPDATE OF title, content_md, tags_text`（限定列），不能写 `AFTER UPDATE`（监听全列）。knowledge-base v5→v6 修过这个 bug |
| migration 失败导致老数据丢失 | migration 跑前 `BEGIN TRANSACTION`；backfill 完整后 COMMIT；任何一步失败 ROLLBACK。已有 vibe.db 文件先备份到 `vibe.db.bak` |
| rusqlite 单 Mutex 在并发查询下阻塞 | 数据规模小 + 用户单点操作，单 Mutex 足够；如发现瓶颈再切 r2d2 连接池 |
| jieba 词典外的新词（"vibe coding"、"Claude Code"）切不出 token | LIKE fallback：FTS5 返回 0 行时退回 `LIKE '%query%'` 模糊匹配 |

## Complexity Tracking

无 violation。两个软偏离（Constitution IV / V）已计划实施层应对，不需要 justify 进 Complexity Tracking。
