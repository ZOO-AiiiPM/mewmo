// 订阅区前端 wrapper —— 全部 invoke Rust commands。
//
// 历史：worktree 时代是「前端直 SQL + Rust 只做 fetch」，现在统一到「前端只 invoke / Rust
// 端做 db CRUD + 网络」。业务逻辑（重试 / failure counter / 状态机）全部在 Rust 端。

import { invoke } from '@tauri-apps/api/core';
import type { FeedEntry, SubscriptionSource } from '../types';

export interface AddResult {
  source: SubscriptionSource;
  entries_inserted: number;
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

export const addSubscription = (url: string) =>
  invoke<AddResult>('add_subscription', { url });

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
