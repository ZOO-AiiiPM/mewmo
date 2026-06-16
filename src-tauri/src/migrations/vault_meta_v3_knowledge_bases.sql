-- vault-meta.db v3: Knowledge Base display metadata
-- Only stores UI properties (color, sort order) that can't live on the filesystem.
-- The actual KB content (folders + notes) lives in vault/library/<dir_name>/.

CREATE TABLE IF NOT EXISTS knowledge_bases (
    dir_name TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT 'blue',
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT ''
);
