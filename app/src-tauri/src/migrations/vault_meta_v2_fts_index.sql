-- vault-meta.db v2: 笔记 + 剪藏 vault markdown FTS5 索引
-- spec 003-notes-clips-to-vault, data-model.md §Vault FTS Index Schema
--
-- 索引来源：<vault>/wiki/notes/*.md + <vault>/raw/clips/*.md
-- 增量更新由 spec 002 notify-debouncer-full watcher 触发（vault::watcher）
-- 启动自愈：vault::meta_db::init_or_heal 检测 FTS 行数与 vault markdown 数量不匹配 → 调 vault::search::build_index 重建
--
-- tokenizer 暂用 unicode61，后续可换 jieba（沿用 mewmo v4_search.sql 中文分词模式）

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    slug UNINDEXED,
    title,
    body,
    tags,
    tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
    slug UNINDEXED,
    url UNINDEXED,
    title,
    body,
    tags,
    tokenize = 'unicode61'
);

-- 元数据表：记录已索引文件 mtime，用于增量维护（避免每次都全扫 vault）
CREATE TABLE IF NOT EXISTS indexed_files (
    slug TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('note', 'clip')),
    mtime INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (slug, type)
);

CREATE INDEX IF NOT EXISTS idx_indexed_files_type ON indexed_files(type);
