import { useEffect, useMemo, useState } from 'react';
import type { SubscriptionSource } from '../types';

type Props = {
  sources: SubscriptionSource[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRefresh: () => void;
  onManage: () => void;
  refreshing: boolean;
  hidden?: boolean;
};

/** 取域名首字母作 favicon placeholder */
function faviconLabel(s: SubscriptionSource): string {
  const text = s.title || s.feed_url;
  return text.replace(/[^a-zA-Z0-9一-龥]/g, '').slice(0, 2).toUpperCase() || '·';
}

/** 简单 hash → 稳定颜色（同一 source 永远同色） */
function colorFor(s: SubscriptionSource): string {
  const palette = [
    '#f97316', '#0a0a0a', '#0070f3', '#dc2626', '#16a34a',
    '#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#0d9488',
  ];
  let hash = 0;
  for (const ch of s.feed_url) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function fmtRelativeTime(ts: number | null): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function SourceList({
  sources,
  selectedId,
  onSelect,
  onAdd,
  onRefresh,
  onManage,
  refreshing,
  hidden = false,
}: Props) {
  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-56'}`}
    >
      {/* col-header h-12，和其它列对齐 */}
      <div className="shrink-0 h-12 px-3 flex items-center justify-between border-b border-black/[0.1] dark:border-white/[0.1]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-semibold text-stone-800 dark:text-stone-100">订阅源</span>
          {sources.length > 0 && (
            <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">{sources.length}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onRefresh}
            title="刷新所有订阅源"
            disabled={refreshing}
            className="w-7 h-7 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button
            onClick={onManage}
            title="管理订阅源"
            className="w-7 h-7 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={onAdd}
            title="添加订阅源"
            className="w-7 h-7 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
            <div className="mb-2">还没订阅任何源 ✨</div>
            <button
              onClick={onAdd}
              className="text-stone-700 dark:text-stone-200 underline hover:text-stone-900 dark:hover:text-stone-100"
            >
              添加第一个
            </button>
          </div>
        ) : (
          sources.map(s => {
            const isUnhealthy = s.status === 'unhealthy';
            return (
              <div
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`px-3 py-2.5 cursor-pointer flex items-center gap-2.5 transition-colors ${
                  selectedId === s.id
                    ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                    : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                }`}
              >
                {/* favicon: 真实 logo（feed metadata）→ fallback letter placeholder */}
                <SourceFavicon source={s} unhealthy={isUnhealthy} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-stone-900 dark:text-stone-100 truncate">
                    {s.title || s.feed_url}
                  </div>
                  <div className={`text-[11px] truncate ${isUnhealthy ? 'text-red-500' : 'text-stone-500 dark:text-stone-400'}`}>
                    {isUnhealthy
                      ? '抓取失败'
                      : (s.status === 'pending' ? '抓取中…' : fmtRelativeTime(s.last_fetched_at))}
                  </div>
                </div>
                {(s.unread_count ?? 0) > 0 && (
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-stone-700 dark:text-stone-100 bg-black/[0.06] dark:bg-white/[0.08] px-2 py-0.5 rounded-full">
                    {s.unread_count}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/** 三层 fallback：feed 声明的 favicon_url → 站点 /favicon.ico → 首字母 placeholder */
function SourceFavicon({ source, unhealthy }: { source: SubscriptionSource; unhealthy: boolean }) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (source.favicon_url) list.push(source.favicon_url);
    if (source.site_url) {
      try {
        const u = new URL(source.site_url);
        list.push(`${u.protocol}//${u.host}/favicon.ico`);
      } catch (_) {
        /* invalid site_url，跳过 */
      }
    }
    return list;
  }, [source.favicon_url, source.site_url]);

  const [idx, setIdx] = useState(0);
  // candidates 变化时重置（如刷新拿到新 favicon_url）
  useEffect(() => setIdx(0), [candidates.join('|')]);

  const useImg = !unhealthy && idx < candidates.length;
  return (
    <div
      className="w-7 h-7 rounded-md grid place-items-center text-white text-[11px] font-semibold shrink-0 overflow-hidden"
      style={{ background: unhealthy ? '#ef4444' : (useImg ? '#fafaf9' : colorFor(source)) }}
    >
      {unhealthy ? (
        '!'
      ) : useImg ? (
        <img
          src={candidates[idx]}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setIdx(i => i + 1)}
          loading="lazy"
        />
      ) : (
        faviconLabel(source)
      )}
    </div>
  );
}
