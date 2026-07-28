# Tauri Commands Contract: 订阅区

**Status**: Phase 1 设计
**File**: 实现在 `app/src-tauri/src/subscription/commands.rs`，由 `lib.rs` 注册

所有 command 都 async，返回 `Result<T, String>`（错误用字符串描述返回前端，前端展示给用户）。

## Command 列表

### `add_subscription`

**Purpose**: 用户提交一个 URL，校验 + 抓取 + 入库

**Args**:
```rust
async fn add_subscription(url: String) -> Result<Source, String>
```

**Behavior**:
1. URL 校验（合法 http/https）
2. 用 `RssAtomAdapter` 抓取首次（含历史 entries）
3. 解析 feed 拿 title / description / site_url
4. INSERT 到 `subscription_sources`（status='pending'）
5. 抓到的 entries 批量 INSERT 到 `feed_entries`
6. 更新 source.status='ok' + last_fetched_at
7. 返回完整 Source 对象（前端 UI 立刻看到）

**Errors**:
- `"INVALID_URL: <details>"` — URL 格式错误
- `"DUPLICATE_URL"` — feed_url 已存在（UNIQUE 约束）
- `"FETCH_FAILED: <details>"` — 网络错 / 4xx / 5xx
- `"PARSE_FAILED: <details>"` — feed-rs 解析错（不是合法 RSS/Atom）

---

### `list_sources_with_unread`

**Purpose**: 获取所有源 + 未读数（左栏 SourceList 用）

**Args**:
```rust
async fn list_sources_with_unread() -> Result<Vec<SourceWithUnread>, String>
```

**Returns**: `Vec<{ ...Source, unread_count: i64 }>`，按 `last_fetched_at DESC` 排序

---

### `list_entries_for_source`

**Purpose**: 获取指定源的所有 entries（中栏 EntryList 用）

**Args**:
```rust
async fn list_entries_for_source(source_id: i64) -> Result<Vec<Entry>, String>
```

**Returns**: `Vec<Entry>`，按 `COALESCE(published_at, fetched_at) DESC` 排序

---

### `mark_entry_read`

**Purpose**: 用户点开一条 entry → 标记为已读

**Args**:
```rust
async fn mark_entry_read(entry_id: i64) -> Result<(), String>
```

**Behavior**: `UPDATE feed_entries SET read_at = unixepoch() WHERE id = ? AND read_at IS NULL`（idempotent）

---

### `delete_source`

**Purpose**: 删除一个 source（连带 entries 级联删）

**Args**:
```rust
async fn delete_source(source_id: i64) -> Result<(), String>
```

**Behavior**: `DELETE FROM subscription_sources WHERE id = ?`（ON DELETE CASCADE 处理 entries）

---

### `refresh_all_subscriptions`

**Purpose**: 用户手动点刷新按钮 / app 启动时检查触发

**Args**:
```rust
async fn refresh_all_subscriptions() -> Result<RefreshSummary, String>

pub struct RefreshSummary {
    pub total: i32,
    pub success: i32,
    pub failed: i32,
    pub skipped_304: i32,        // ETag 命中或 MD5 一致
    pub new_entries: i32,        // 新增 entry 总数
    pub started_at: i64,
    pub finished_at: i64,
}
```

**Behavior**:
1. SELECT 所有 source（不分 status）
2. 串行调用 `RssAtomAdapter::fetch(source)`：
   - 带 `If-None-Match` / `If-Modified-Since`
   - 304 → skipped_304++，跳过
   - 200 → MD5 与 last_content_hash 比，一致也 skipped_304++
   - 内容变化 → feed-rs 解析 → INSERT entries（UNIQUE 去重）→ success++
   - 网络错 → 重试 2 次（5s 间隔）→ 仍失败则 consecutive_failure_count++，达到 3 时 status='unhealthy'
3. 单次 batch 内任何源的失败不阻塞其他源
4. 返回 summary 给前端展示（"刷新完成：3 源更新 12 条新内容，2 源失败"）

**Errors**: 仅在数据库自身不可用时返回 Err，单源失败统计在 summary 内

---

### `should_auto_refresh_on_startup`

**Purpose**: app 启动时前端调用，看是否需要触发 refresh_all（"今天是否抓过"）

**Args**:
```rust
async fn should_auto_refresh_on_startup() -> Result<bool, String>
```

**Behavior**: `SELECT MAX(last_fetched_at) FROM subscription_sources`；时间戳转日期 != today 返回 true

---

### 数据流总览

```text
前端 onMount (启动)
  ↓ invoke('should_auto_refresh_on_startup')
  ├─ true  → invoke('refresh_all_subscriptions')  → UI 显示 loading → 完成后刷新列表
  └─ false → 直接 invoke('list_sources_with_unread') 渲染

用户点 source X
  ↓ invoke('list_entries_for_source', { source_id: X })
  → 渲染 EntryList

用户点 entry Y
  ↓ invoke('mark_entry_read', { entry_id: Y })
  → UI 把 Y 的 unread-dot 隐去 + Reader 渲染 entry.content_html

用户点刷新按钮
  ↓ invoke('refresh_all_subscriptions')
  → UI 显示 loading toast / spin animation
  → 完成后 invoke('list_sources_with_unread') 刷新

用户加新源
  ↓ invoke('add_subscription', { url: 'https://...' })
  → 成功：invoke('list_sources_with_unread') + 选中新源
  → 失败：modal 显示 error 提示

用户删除源
  ↓ invoke('delete_source', { source_id: X })
  → invoke('list_sources_with_unread')，若当前选中 X 则切到第一个
```

## Frontend Wrapper（参照 `app/src/lib/db.ts` 模式）

```typescript
// app/src/lib/subscription.ts

import { invoke } from '@tauri-apps/api/core';
import type { SubscriptionSource, FeedEntry } from '../types';

export interface RefreshSummary {
  total: number;
  success: number;
  failed: number;
  skipped_304: number;
  new_entries: number;
  started_at: number;
  finished_at: number;
}

export const addSubscription = (url: string) =>
  invoke<SubscriptionSource>('add_subscription', { url });

export const listSourcesWithUnread = () =>
  invoke<SubscriptionSource[]>('list_sources_with_unread');

export const listEntriesForSource = (source_id: number) =>
  invoke<FeedEntry[]>('list_entries_for_source', { source_id });

export const markEntryRead = (entry_id: number) =>
  invoke<void>('mark_entry_read', { entry_id });

export const deleteSource = (source_id: number) =>
  invoke<void>('delete_source', { source_id });

export const refreshAllSubscriptions = () =>
  invoke<RefreshSummary>('refresh_all_subscriptions');

export const shouldAutoRefreshOnStartup = () =>
  invoke<boolean>('should_auto_refresh_on_startup');
```

## Error Handling Convention

- 命令错误统一用 `Err(String)` 返回，前缀分类：`"INVALID_X: ..."` / `"DUPLICATE_X"` / `"FETCH_FAILED: ..."` / `"PARSE_FAILED: ..."` / `"DB_ERROR: ..."`
- 前端按前缀分支处理（i18n 文案在前端做，后端只给英文 + 调试细节）
- 不抛 panic（`.expect()` / `unwrap()` 在生产 Tauri command 里禁用）
