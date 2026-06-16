-- v6: 订阅区 schema —— subscription_sources + feed_entries 两表 + 3 个 index
-- idempotent：CREATE TABLE / INDEX IF NOT EXISTS。db 已存在 sub schema（worktree 时代用 plugin_sql migrations 跑过）
-- 时再跑 v6 不撞 already exists。详见 lessons/ddl-migration-idempotent.md

CREATE TABLE IF NOT EXISTS subscription_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  site_url TEXT,
  favicon_url TEXT,
  etag TEXT,
  last_modified TEXT,
  last_content_hash TEXT,
  last_fetched_at INTEGER,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',           -- 'ok' / 'unhealthy' / 'pending'
  status_detail TEXT,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sources_status ON subscription_sources(status);

CREATE TABLE IF NOT EXISTS feed_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES subscription_sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  link TEXT,
  author TEXT NOT NULL DEFAULT '',
  published_at INTEGER,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  read_at INTEGER,
  UNIQUE(source_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_entries_source_published ON feed_entries(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_read ON feed_entries(read_at);
