-- vault-meta.db v1: Phase 0 schema 占位
-- spec 002-vault-wiki-foundation, data-model.md §10
-- 4 张表（feed_stream / activity_events / notification_log / cat_memory_metadata），数据填充留 Phase 1+

CREATE TABLE IF NOT EXISTS feed_stream (
    id INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'  -- new | sedimented | dismissed
);

CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    details TEXT  -- JSON blob
);

CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    channel TEXT NOT NULL,  -- in-app | macos | none
    category TEXT,
    payload TEXT
);

CREATE TABLE IF NOT EXISTS cat_memory_metadata (
    page_path TEXT PRIMARY KEY,
    last_synced TEXT NOT NULL,
    update_cadence TEXT,
    last_writer TEXT
);

CREATE INDEX IF NOT EXISTS idx_feed_stream_source_published
    ON feed_stream(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp
    ON activity_events(timestamp DESC);
