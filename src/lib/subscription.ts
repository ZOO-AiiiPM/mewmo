// 订阅区前端 wrapper —— 全部 invoke Rust commands。
//
// 历史：worktree 时代是「前端直 SQL + Rust 只做 fetch」，现在统一到「前端只 invoke / Rust
// 端做 db CRUD + 网络」。业务逻辑（重试 / failure counter / 状态机）全部在 Rust 端。
//
// 用 tauriCall.ts 的 call<T> 而不是直接 invoke<T>——共用 __TAURI_INTERNALS__ 注入时序的
// retry 包装。之前直接 invoke 会在 webview 启动那段窗口里抛错（订阅源初始化失败这种 bug）。

import type { FeedEntry, SubscriptionSource } from '../types';
import { call } from './tauriCall';

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
  call<AddResult>('add_subscription', { url });

export const listSourcesWithUnread = () =>
  call<SubscriptionSource[]>('list_sources_with_unread');

export const listEntriesForSource = (source_id: number) =>
  call<FeedEntry[]>('list_entries_for_source', { source_id });

export const markEntryRead = (entry_id: number) =>
  call<void>('mark_entry_read', { entry_id });

export const deleteSource = (source_id: number) =>
  call<void>('delete_source', { source_id });

export const refreshAllSubscriptions = () =>
  call<RefreshSummary>('refresh_all_subscriptions');

export const shouldAutoRefreshOnStartup = () =>
  call<boolean>('should_auto_refresh_on_startup');
