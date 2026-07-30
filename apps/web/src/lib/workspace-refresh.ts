/**
 * #10-F: broadcast channel for "these workspace list resources changed,
 * refetch them now" — used when a background writer (e.g. an agent write
 * action) changes data that mounted views are currently displaying.
 *
 * The cached value is intentionally kept in place for broadcast keys so
 * listeners refetch flicker-free (stale-while-revalidate); hard invalidation
 * stays the job of `invalidateWorkspaceResource*` in workspace-data-cache.
 */

export const WORKSPACE_REFRESH_EVENT = "mewmo:workspace-refresh";

export interface WorkspaceRefreshDetail {
  keys: string[];
}

export function broadcastWorkspaceRefresh(keys: string[]) {
  if (typeof window === "undefined" || keys.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceRefreshDetail>(WORKSPACE_REFRESH_EVENT, { detail: { keys } }),
  );
}

export function workspaceRefreshAffects(detail: unknown, key: string): boolean {
  if (typeof detail !== "object" || detail === null) return false;
  const keys = (detail as Partial<WorkspaceRefreshDetail>).keys;
  return Array.isArray(keys) && keys.includes(key);
}
