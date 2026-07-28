# Phase 0 Research: 全局搜索 + 标签管理

## 1. SQLite FTS5 中文分词方案

**Decision**: 选 `jieba-rs 0.7` 自定义 FTS5 tokenizer，必须切到 `rusqlite` 后端。

**Rationale**:
- 中文搜索精度最高 —— 词级 token，2 字短词如"AI"、"日本"、"会议"召回率 ≥ 95%（spec SC-001 硬约束）
- inkdown 项目（github.com/shoushuidianfei/inkdown）已验证此方案，2026-05 仍在更新

**Alternatives considered**:
- `unicode61`（默认）：每字一 token，2 字短词搜索退化为子串噪声，召回低于 SC-001 要求
- `trigram`（SQLite 3.34+ 内置）：3-gram 索引，≤ 2 字 query 退化，精度不达标
- 教科书答案 trigram 在 GitHub 实战项目调研里没有任何 2026 笔记 app 用，主流是 jieba（inkdown）或 unicode61 + LIKE 兜底（knowledge-base 232⭐）

## 2. SQL 后端选择

**Decision**: `rusqlite 0.31 (features = ["bundled"])` + `Mutex<Connection>`。

**Rationale**:
- jieba 自定义 tokenizer 必须通过 SQLite C-API 注册（`fts5_api` + `fts5_tokenizer_v2`），rusqlite 暴露这个接口
- bundled feature 自带 SQLite ≥ 3.46，FTS5 + bm25 内置
- 数据规模小（万级），单 Mutex<Connection> 比 r2d2 连接池更简单

**Alternatives considered**:
- `tauri-plugin-sql 2.4.0`（sqlx 后端）：不能注册自定义 tokenizer，不可行
- `tauri-plugin-sql + trigram`：精度不达标 SC-001
- `Tantivy`（独立全文索引引擎）：要双写 + 索引同步，过度工程

**Cost**: 现有 8 个 db.ts 函数全改成 invoke 调 Rust commands；接口签名保持 → 组件代码零改动。

## 3. bm25 权重 + 时间衰减

**Decision**:
- `notes_fts` → `bm25(5.0, 1.0, 3.0)`（title : content : tags）
- `clips_fts` → `bm25(5.0, 1.0, 3.0, 2.0, 2.0)`（title : content : tags : site_name : author）
- 叠加 `+ (julianday('now') - julianday(updated_at, 'unixepoch')) * 0.005`

**Rationale**: 抄 knowledge-base 项目（232⭐）的实战权重配置。`* 0.005` 让 30 天差异 = 0.15 分，bm25 量级 1-30 内不会让相关度更高的老笔记被一篇刚改的边缘相关笔记盖掉。

**Alternatives considered**: 全文档相同权重（unranked）—— 标题命中和正文命中无差异，违反 SC-005。

## 4. LIKE fallback

**Decision**: FTS5 返回 0 行时退回 `LIKE '%query%'` 模糊匹配（仅 title + content_md）。

**Rationale**: jieba 词典外的极端新词（"vibe coding"、"Claude Code"、"Cursor"）会被切错，LIKE 兜底救场。knowledge-base 232⭐ 的实战做法。

**Trade-off**: LIKE 是全表扫描，慢但只在 FTS5 0 行时触发，cost 可接受。

## 5. 触发器关键设计

**Decision**: 同步触发器**必须**写 `AFTER UPDATE OF title, content_md, tags_text`（限定列），绝不写 `AFTER UPDATE`（监听全列）。

**Rationale**: knowledge-base v5→v6 修过这个 bug —— 监听全列时，任何字段更新（如 word_count）都会反复 DELETE + INSERT FTS 索引，最终损坏导致 "database disk image is malformed"。

## 6. 一次 migration 落齐 vs 分步

**Decision**: 单次 migration v4 同时落 FTS5 + 标签 schema + tags_text 派生字段 + 全部触发器 + backfill。

**Rationale**: FTS5 虚表后续增加列会强制重建索引（ALTER TABLE 不支持 fts5 表）。一次落齐避免 "v5 加 FTS5 → v6 加 tags_text 列 → FTS5 重建" 的代价。

## Sources

- inkdown: https://github.com/shoushuidianfei/inkdown — Tauri 2 + rusqlite + jieba-rs，2026-05 在更新（中文方案权威参考）
- knowledge-base: https://github.com/bkywksj/knowledge-base — 232⭐，bm25 / 触发器 / LIKE fallback 实战代码（schema.rs migrate_v5_to_v6）
- notes-rs: https://github.com/okhsunrog/notes-rs — Tauri + FTS5 + sqlite-vec 混合（v2 语义检索路径备选参考）
