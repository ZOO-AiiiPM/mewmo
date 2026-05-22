// 订阅功能：前端 db CRUD + Rust 抓取 invoke + batch refresh
//
// 设计原则：
// - db CRUD 全部前端直 SQL（与 lib/db.ts note/clip 一致）
// - Rust 端只做"网络抓取 + feed 解析"（fetch_subscription_source command）
// - 高层操作（addSubscription / refreshAll）在前端 orchestrate

import { invoke } from '@tauri-apps/api/core';
import { getDb } from './db';
import type {
  FeedEntry,
  FetchOutcome,
  FetchedEntry,
  SubscriptionSource,
  SourceStatus,
} from '../types';

const FAILURE_THRESHOLD = 3; // 连续 3 次失败标 unhealthy

// ── Rust command wrapper ──────────────────────────────────────────────────

export async function fetchSubscriptionSource(
  url: string,
  if_none_match?: string | null,
  if_modified_since?: string | null,
): Promise<FetchOutcome> {
  return invoke<FetchOutcome>('fetch_subscription_source', {
    url,
    ifNoneMatch: if_none_match ?? null,
    ifModifiedSince: if_modified_since ?? null,
  });
}

// ── Source CRUD ───────────────────────────────────────────────────────────

const SOURCE_FIELDS =
  'id, feed_url, title, description, site_url, favicon_url, etag, last_modified, ' +
  'last_content_hash, last_fetched_at, consecutive_failure_count, status, status_detail, added_at';

export async function listSources(): Promise<SubscriptionSource[]> {
  const d = await getDb();
  return d.select<SubscriptionSource[]>(
    `SELECT ${SOURCE_FIELDS} FROM subscription_sources ORDER BY last_fetched_at DESC, added_at DESC`,
  );
}

export async function listSourcesWithUnread(): Promise<SubscriptionSource[]> {
  const d = await getDb();
  return d.select<SubscriptionSource[]>(
    `SELECT s.id, s.feed_url, s.title, s.description, s.site_url, s.favicon_url,
            s.etag, s.last_modified, s.last_content_hash, s.last_fetched_at,
            s.consecutive_failure_count, s.status, s.status_detail, s.added_at,
            COALESCE(SUM(CASE WHEN e.read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_count
     FROM subscription_sources s
     LEFT JOIN feed_entries e ON e.source_id = s.id
     GROUP BY s.id
     ORDER BY COALESCE(s.last_fetched_at, s.added_at) DESC`,
  );
}

export async function getSourceById(id: number): Promise<SubscriptionSource | null> {
  const d = await getDb();
  const rows = await d.select<SubscriptionSource[]>(
    `SELECT ${SOURCE_FIELDS} FROM subscription_sources WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function getSourceByUrl(feed_url: string): Promise<SubscriptionSource | null> {
  const d = await getDb();
  const rows = await d.select<SubscriptionSource[]>(
    `SELECT ${SOURCE_FIELDS} FROM subscription_sources WHERE feed_url = ?`,
    [feed_url],
  );
  return rows[0] ?? null;
}

async function insertSource(meta: {
  feed_url: string;
  title: string;
  description: string;
  site_url: string | null;
}): Promise<number> {
  const d = await getDb();
  const result = await d.execute(
    `INSERT INTO subscription_sources
     (feed_url, title, description, site_url, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [meta.feed_url, meta.title, meta.description, meta.site_url],
  );
  return result.lastInsertId as number;
}

async function updateSourceAfterFetch(
  id: number,
  patch: {
    title?: string;
    description?: string;
    site_url?: string | null;
    etag?: string | null;
    last_modified?: string | null;
    status?: SourceStatus;
  },
): Promise<void> {
  const d = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of [
    'title',
    'description',
    'site_url',
    'etag',
    'last_modified',
    'status',
  ] as const) {
    const v = patch[k];
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      args.push(v);
    }
  }
  if (sets.length === 0) return;
  sets.push('last_fetched_at = unixepoch()');
  sets.push('consecutive_failure_count = 0');
  sets.push("status_detail = NULL");
  args.push(id);
  await d.execute(
    `UPDATE subscription_sources SET ${sets.join(', ')} WHERE id = ?`,
    args,
  );
}

async function recordSourceFailure(id: number, error: string): Promise<SourceStatus> {
  const d = await getDb();
  await d.execute(
    `UPDATE subscription_sources
     SET consecutive_failure_count = consecutive_failure_count + 1,
         status_detail = ?,
         last_fetched_at = unixepoch()
     WHERE id = ?`,
    [error, id],
  );
  // 检查是否达到 unhealthy 阈值
  const rows = await d.select<{ consecutive_failure_count: number }[]>(
    `SELECT consecutive_failure_count FROM subscription_sources WHERE id = ?`,
    [id],
  );
  const count = rows[0]?.consecutive_failure_count ?? 0;
  if (count >= FAILURE_THRESHOLD) {
    await d.execute(
      `UPDATE subscription_sources SET status = 'unhealthy' WHERE id = ?`,
      [id],
    );
    return 'unhealthy';
  }
  return 'ok';
}

export async function deleteSource(id: number): Promise<void> {
  const d = await getDb();
  // ON DELETE CASCADE 处理 entries
  await d.execute('DELETE FROM subscription_sources WHERE id = ?', [id]);
}

// ── Entry CRUD ────────────────────────────────────────────────────────────

const ENTRY_FIELDS =
  'id, source_id, guid, title, content_html, excerpt, link, author, published_at, fetched_at, read_at';

export async function listEntriesForSource(source_id: number): Promise<FeedEntry[]> {
  const d = await getDb();
  return d.select<FeedEntry[]>(
    `SELECT ${ENTRY_FIELDS} FROM feed_entries
     WHERE source_id = ?
     ORDER BY COALESCE(published_at, fetched_at) DESC`,
    [source_id],
  );
}

export async function getEntryById(id: number): Promise<FeedEntry | null> {
  const d = await getDb();
  const rows = await d.select<FeedEntry[]>(
    `SELECT ${ENTRY_FIELDS} FROM feed_entries WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function insertEntries(source_id: number, entries: FetchedEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const d = await getDb();
  let inserted = 0;
  // 串行 insert，UNIQUE(source_id, guid) 自动去重（已有的 INSERT OR IGNORE）
  for (const e of entries) {
    try {
      const result = await d.execute(
        `INSERT OR IGNORE INTO feed_entries
         (source_id, guid, title, content_html, excerpt, link, author, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          source_id,
          e.guid,
          e.title,
          e.content_html,
          e.excerpt,
          e.link,
          e.author,
          e.published_at,
        ],
      );
      if ((result.rowsAffected ?? 0) > 0) inserted++;
    } catch (err) {
      console.warn('[subscription] insert entry failed:', e.guid, err);
    }
  }
  return inserted;
}

export async function markEntryRead(entry_id: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE feed_entries SET read_at = unixepoch() WHERE id = ? AND read_at IS NULL`,
    [entry_id],
  );
}

// ── 高层操作：add / refresh ───────────────────────────────────────────────

export interface AddResult {
  source: SubscriptionSource;
  entries_inserted: number;
}

/** 添加新订阅源：抓取 → 解析 → INSERT source + entries */
export async function addSubscription(url: string): Promise<AddResult> {
  // 1. URL 简单校验
  let feed_url: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('only http/https supported');
    }
    feed_url = parsed.toString();
  } catch (_) {
    throw new Error(`INVALID_URL: ${url}`);
  }

  // 2. 重复检测
  const dup = await getSourceByUrl(feed_url);
  if (dup) {
    throw new Error('DUPLICATE_URL');
  }

  // 3. 抓取（首次无 etag/last_modified）
  const outcome = await fetchSubscriptionSource(feed_url);

  if (outcome.status !== 'updated') {
    throw new Error('FETCH_FAILED: server returned 304 on first fetch (unexpected)');
  }

  // 4. INSERT source（status 先 pending）
  const id = await insertSource({
    feed_url,
    title: outcome.feed_meta.title || hostnameOf(feed_url),
    description: outcome.feed_meta.description,
    site_url: outcome.feed_meta.site_url,
  });

  // 5. INSERT entries
  const inserted = await insertEntries(id, outcome.entries);

  // 6. 更新 source.status='ok' + etag + last_modified + last_fetched_at
  await updateSourceAfterFetch(id, {
    etag: outcome.etag,
    last_modified: outcome.last_modified,
    status: 'ok',
  });

  const source = await getSourceById(id);
  if (!source) throw new Error('UNEXPECTED: source disappeared after insert');

  return { source, entries_inserted: inserted };
}

export interface RefreshSummary {
  total: number;
  success: number;
  failed: number;
  skipped_304: number;
  new_entries: number;
  started_at: number;
  finished_at: number;
}

/** Batch refresh：遍历所有 source，调 Rust adapter，处理结果 */
export async function refreshAllSubscriptions(): Promise<RefreshSummary> {
  const started_at = Math.floor(Date.now() / 1000);
  const sources = await listSources();
  const summary: RefreshSummary = {
    total: sources.length,
    success: 0,
    failed: 0,
    skipped_304: 0,
    new_entries: 0,
    started_at,
    finished_at: started_at,
  };

  for (const s of sources) {
    try {
      const outcome = await fetchSubscriptionSource(
        s.feed_url,
        s.etag,
        s.last_modified,
      );
      if (outcome.status === 'not_modified') {
        // 仅刷新 last_fetched_at + 重置 failure
        await updateSourceAfterFetch(s.id, { status: 'ok' });
        summary.skipped_304++;
        summary.success++;
      } else {
        const inserted = await insertEntries(s.id, outcome.entries);
        await updateSourceAfterFetch(s.id, {
          title: outcome.feed_meta.title || s.title,
          description: outcome.feed_meta.description || s.description,
          site_url: outcome.feed_meta.site_url ?? s.site_url,
          etag: outcome.etag,
          last_modified: outcome.last_modified,
          status: 'ok',
        });
        summary.new_entries += inserted;
        summary.success++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordSourceFailure(s.id, msg);
      summary.failed++;
    }
  }

  summary.finished_at = Math.floor(Date.now() / 1000);
  return summary;
}

/** 启动时检查：今天还没抓过 → 触发 refresh */
export async function shouldAutoRefreshOnStartup(): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<{ max_ts: number | null }[]>(
    `SELECT MAX(last_fetched_at) AS max_ts FROM subscription_sources`,
  );
  const maxTs = rows[0]?.max_ts;
  if (!maxTs) return true; // 从未抓过 → 该抓一次（空 sources 表也安全：refresh 啥都不做）
  // 比较年月日
  const last = new Date(maxTs * 1000);
  const today = new Date();
  return (
    last.getFullYear() !== today.getFullYear() ||
    last.getMonth() !== today.getMonth() ||
    last.getDate() !== today.getDate()
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return url;
  }
}
