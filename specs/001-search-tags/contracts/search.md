# Contracts: Search Command

## search_all(query: string) -> SearchResults

```typescript
type NoteHit = {
  id: number;
  title: string;
  snippet: string;       // ~32 字片段，含 <mark> 标签
  updated_at: number;
};

type ClipHit = {
  id: number;
  title: string;
  site_name: string;
  author: string;
  snippet: string;       // ~32 字片段，含 <mark>
  saved_at: number;
};

type SearchResults = {
  notes: NoteHit[];
  clips: ClipHit[];
};

invoke<SearchResults>('search_all', { query: '机器学习' })
```

## 处理规则

- query 经 `.trim()` 后为空 → 直接返回 `{ notes: [], clips: [] }`，不查 DB
- 每类 LIMIT 50（FR-022 性能 + UI 滚动友好）
- ORDER BY `bm25(...) + (julianday('now') - julianday(updated_at, 'unixepoch')) * 0.005`
  - notes_fts: `bm25(notes_fts, 5.0, 1.0, 3.0)`（title : content : tags）
  - clips_fts: `bm25(clips_fts, 5.0, 1.0, 3.0, 2.0, 2.0)`（title : content : tags : site_name : author）
- FTS5 返回 0 行时 fallback 到 LIKE `%query%` 查 title + content_md
- 高亮用 FTS5 内置：`snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32)`
- 多关键词（输入"机器学习 项目"）默认 AND；FTS5 MATCH 语法天然支持

## 防抖

前端：搜索框 onChange 加 200ms debounce 后调 invoke（避免每个字符触发查询）。debounce 在前端实现，**不在** Rust 端做。

## 错误处理

- query 含 FTS5 特殊字符（`"`、`*`、`(`、`)`、`-`）时，前端 escape 或 server-side sanitize
- DB 锁住 / migration 未完成 → reject error，前端显示"搜索准备中"
