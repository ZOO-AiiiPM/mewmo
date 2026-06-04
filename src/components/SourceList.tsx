import { useEffect, useMemo, useState } from 'react';
import type { SubscriptionSource } from '../types';
import { ListItemContextMenu } from './ListItemContextMenu';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  sources: SubscriptionSource[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRefresh: () => void;
  onDelete?: (id: number) => void;
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
  onDelete,
  refreshing,
  hidden = false,
}: Props) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const confirmSource = sources.find(s => s.id === confirmId) ?? null;
  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-48'}`}
    >
      {/* col-header h-12，和其它列对齐 */}
      <div className="relative shrink-0 h-12 px-3 flex items-center justify-between">
        <div className="absolute bottom-0 left-3 right-3 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
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
            const itemBody = (
              <div
                onClick={() => onSelect(s.id)}
                className={`pl-8 pr-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors ${
                  selectedId === s.id
                    ? 'bg-black/[0.10] dark:bg-white/[0.12]'
                    : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                {/* favicon: 真实 logo（feed metadata）→ fallback letter placeholder */}
                <SourceFavicon source={s} unhealthy={isUnhealthy} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">
                    {s.title || s.feed_url}
                  </div>
                  <div className={`text-[11px] truncate ${isUnhealthy ? 'text-red-500' : 'text-stone-500 dark:text-stone-400'}`}>
                    {isUnhealthy
                      ? '抓取失败'
                      : (s.status === 'pending' ? '抓取中…' : fmtRelativeTime(s.last_fetched_at))}
                  </div>
                </div>
              </div>
            );
            if (!onDelete) return <div key={s.id}>{itemBody}</div>;
            return (
              <ListItemContextMenu
                key={s.id}
                onDelete={() => setConfirmId(s.id)}
                deleteLabel="取消订阅"
              >
                {itemBody}
              </ListItemContextMenu>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="取消订阅这个源？"
        description={confirmSource?.title
          ? `「${confirmSource.title}」及其下所有文章都会被永久删除`
          : '该订阅源及其下所有文章都会被永久删除'}
        confirmLabel="取消订阅"
        variant="danger"
        onConfirm={() => {
          if (confirmId !== null) onDelete?.(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </aside>
  );
}

/** 跨 mount 持久化"已知失败的 favicon URL"。
 * SourceFavicon 每次 unmount/remount 都会 useState(0) 重置 idx → 重跑 fallback chain →
 * 第一个 candidate 实际 404 时会经历"img onError → setIdx(1) → 显示首字母"两帧，
 * 用户视觉上看到一闪（背景色从白底 placeholder 跳到彩色首字母）。
 * Set 让"已确认失败"的 URL 在 session 内不再被尝试，下次 mount 直接渲染首字母。 */
const failedFaviconUrls = new Set<string>();

/** 三层 fallback：feed 声明的 favicon_url → 站点 /favicon.ico → 首字母 placeholder */
function SourceFavicon({ source, unhealthy }: { source: SubscriptionSource; unhealthy: boolean }) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (source.favicon_url) list.push(source.favicon_url);
    if (source.site_url) {
      try {
        const u = new URL(source.site_url);
        list.push(`${u.protocol}//${u.host}/favicon.ico`);
      } catch {
        /* invalid site_url，跳过 */
      }
    }
    return list;
  }, [source.favicon_url, source.site_url]);
  const candidateKey = candidates.join('|');

  // 初始化时跳过已知失败的 candidates，直接定位到第一个未确认失败的（或越界 → 显示首字母）。
  // 这样切 zone 重新 mount 后不会再触发"img 加载失败 → onError → setIdx(1)"的两帧闪烁。
  const initialIdx = (() => {
    let i = 0;
    while (i < candidates.length && failedFaviconUrls.has(candidates[i])) i++;
    return i;
  })();
  const [idx, setIdx] = useState(initialIdx);
  // candidates 变化时（如刷新拿到新 favicon_url）重新跑跳过逻辑
  useEffect(() => {
    let i = 0;
    while (i < candidates.length && failedFaviconUrls.has(candidates[i])) i++;
    setIdx(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  const useImg = !unhealthy && idx < candidates.length;
  return (
    <div
      className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0 overflow-hidden"
      style={{ background: unhealthy ? '#ef4444' : (useImg ? '#fafaf9' : colorFor(source)) }}
    >
      {unhealthy ? (
        '!'
      ) : useImg ? (
        <img
          src={candidates[idx]}
          alt=""
          className="w-full h-full object-cover"
          onError={() => {
            failedFaviconUrls.add(candidates[idx]);
            setIdx(i => i + 1);
          }}
          loading="lazy"
        />
      ) : (
        faviconLabel(source)
      )}
    </div>
  );
}
