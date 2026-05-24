# Data Model: 订阅区

**Status**: Phase 1 设计完成
**Storage**: SQLite via `tauri-plugin-sql`，落到既有 `vibe.db`
**Migration**: 加到 `app/src-tauri/src/lib.rs` 既有 migrations 数组（按现有模式，version 递增）

## Schema

```sql
-- Migration: subscription_sources
CREATE TABLE subscription_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url TEXT NOT NULL UNIQUE,                      -- 用户提供的 URL
  title TEXT NOT NULL DEFAULT '',                     -- feed 解析出的标题（解析失败时回退到 host name）
  description TEXT NOT NULL DEFAULT '',               -- feed 描述（可选，展示用）
  site_url TEXT,                                      -- feed 关联的网站首页 URL（用于"在浏览器打开"动作）
  favicon_url TEXT,                                   -- 可选，UI 的 source-favicon 显示
  etag TEXT,                                          -- 上次响应的 ETag header
  last_modified TEXT,                                 -- 上次响应的 Last-Modified header
  last_content_hash TEXT,                             -- 上次响应 body 的 MD5（304 兜底层）
  last_fetched_at INTEGER,                            -- 上次成功抓取时间（unix epoch seconds）
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',                  -- 'ok' / 'unhealthy' / 'pending'
  status_detail TEXT,                                 -- 失败时的错误描述（DNS / timeout / 4xx / 5xx）
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_sources_status ON subscription_sources(status);

-- Migration: feed_entries
CREATE TABLE feed_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES subscription_sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,                                 -- RSS guid 或 Atom id（feed 内全局唯一）
  title TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',              -- 原 feed 的 HTML content（reader 渲染用）
  excerpt TEXT NOT NULL DEFAULT '',                   -- 列表预览用（截首 N 字）
  link TEXT,                                          -- 原文 URL（toolbar"在浏览器打开"动作）
  author TEXT NOT NULL DEFAULT '',
  published_at INTEGER,                               -- 发布时间（unix epoch；feed 没给则置 NULL，回退用 fetched_at）
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  read_at INTEGER,                                    -- NULL = 未读；点开时 set 为 unixepoch()
  UNIQUE(source_id, guid)                             -- 同源同 guid 去重
);

CREATE INDEX idx_entries_source_published ON feed_entries(source_id, published_at DESC);
CREATE INDEX idx_entries_read ON feed_entries(read_at);
```

**Migration 编号**：跟在既有 migrations 之后顺延（实际编号在 lib.rs 现状决定，不写死）。

## Entities (Rust)

```rust
// app/src-tauri/src/subscription/store.rs

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Source {
    pub id: i64,
    pub feed_url: String,
    pub title: String,
    pub description: String,
    pub site_url: Option<String>,
    pub favicon_url: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_content_hash: Option<String>,
    pub last_fetched_at: Option<i64>,
    pub consecutive_failure_count: i32,
    pub status: SourceStatus,
    pub status_detail: Option<String>,
    pub added_at: i64,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SourceStatus { Ok, Unhealthy, Pending }

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub id: i64,
    pub source_id: i64,
    pub guid: String,
    pub title: String,
    pub content_html: String,
    pub excerpt: String,
    pub link: Option<String>,
    pub author: String,
    pub published_at: Option<i64>,
    pub fetched_at: i64,
    pub read_at: Option<i64>,
}
```

## Entities (TypeScript) — 前端镜像

```typescript
// app/src/types.ts 追加

export type SourceStatus = 'ok' | 'unhealthy' | 'pending';

export interface SubscriptionSource {
  id: number;
  feed_url: string;
  title: string;
  description: string;
  site_url: string | null;
  favicon_url: string | null;
  last_fetched_at: number | null;
  consecutive_failure_count: number;
  status: SourceStatus;
  status_detail: string | null;
  added_at: number;
  unread_count?: number;        // 由 list_sources_with_unread 命令补充
}

export interface FeedEntry {
  id: number;
  source_id: number;
  guid: string;
  title: string;
  content_html: string;
  excerpt: string;
  link: string | null;
  author: string;
  published_at: number | null;
  fetched_at: number;
  read_at: number | null;
}
```

## State Transitions

### Source.status

```text
        add_subscription
              ↓
            pending  ──fetch ok──→  ok
              │                     │
              └─fetch fail──┐       │
                            ↓       │
                       (count++)    │
                            │       │
                  count < 3 ─┘      │
                            │       │
                  count >= 3        │
                            ↓       │
                       unhealthy    │
                            │       │
                       fetch ok ────┘
```

- **pending**: 刚添加未抓过 / 抓取中
- **ok**: 上次抓取成功
- **unhealthy**: 连续 3+ 次失败；UI 红点；**仍保持订阅**，下次抓取继续尝试，成功则回 ok

### Entry.read_at

```text
NULL (未读)  ──user clicks entry──→  unixepoch() (已读)
```

- 单向转换（v1 不做"标回未读"按钮，由用户决策时去掉）

## Validation Rules

- **feed_url**：必填、唯一；前端添加时 `URL.parse()` 校验；后端再做一次（怕用户手动绕过）
- **guid**：去重键；feed 没提供 guid 时用 `link` 兜底；都没有时跳过这条 entry（极少见）
- **published_at**：feed 没给时置 NULL；列表展示用 `published_at ?? fetched_at` 排序
- **content_html**：max 5MB，超过截断（反恶意 feed）
- **status_detail**：失败时填具体错误描述（"DNS resolve failed: example.com" / "HTTP 404"）

## Relationships

```text
subscription_sources (1)  ────  (N) feed_entries
                       ON DELETE CASCADE
```

删除一个 source 时，所有 entries 一并级联删除（sqlite 自动处理，不需要应用层手工清理）。

## Indexes Justification

- `idx_sources_status`：源管理界面按 unhealthy 高亮 + 统计 unhealthy 数
- `idx_entries_source_published`：entries 列表按 source 筛 + 按 published_at desc 排序的主路径
- `idx_entries_read`：未读数统计（`SELECT COUNT(*) WHERE read_at IS NULL`）

## Migration Strategy

新加 migration version（编号顺延既有 migrations 数组）。**不修改既有的 notes / clips 表** —— 订阅区与笔记 / 剪藏完全独立。
