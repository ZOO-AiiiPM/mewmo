import { useEffect, useRef, useState } from 'react';
import type { FeedEntry, SubscriptionSource } from '../types';
import { BUCKET_LABEL, formatListItemDate, getBucket, type Bucket } from '../lib/dateBuckets';

// 副标题里「作者/来源」过长时右尾横向渐隐，替代省略号截断（与标题 fade 同一手法）。
const META_FADE_STYLE = {
  maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)',
  WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)',
} as const;

type Props = {
  entries: FeedEntry[];
  source: SubscriptionSource | null;
  selectedId: number | null;
  onSelect: (entry: FeedEntry) => void;
  hidden?: boolean;
};

function entryTimestamp(e: FeedEntry): number {
  return e.published_at ?? e.fetched_at;
}

function groupEntries(entries: FeedEntry[]): Array<{ bucket: Bucket; items: FeedEntry[] }> {
  const ORDER: Bucket[] = ['today', 'yesterday', 'week', 'month', 'year', 'older'];
  const map = new Map<Bucket, FeedEntry[]>();
  for (const e of entries) {
    const b = getBucket(entryTimestamp(e));
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(e);
  }
  return ORDER.filter(b => map.has(b)).map(b => ({ bucket: b, items: map.get(b)! }));
}

export function EntryList({ entries, source, selectedId, onSelect, hidden = false }: Props) {
  const groups = groupEntries(entries);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-[261px]'}`}
    >
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
            选个订阅源看看
          </div>
        ) : (
          groups.map((g, idx) => (
            <section key={g.bucket}>
              <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                {idx > 0 && <div className="absolute top-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />}
                <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                <span>{BUCKET_LABEL[g.bucket]}</span>
                <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              {g.items.map(e => (
                <EntryItem
                  key={e.id}
                  entry={e}
                  source={source}
                  active={selectedId === e.id}
                  bucket={g.bucket}
                  onSelect={onSelect}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function EntryItem({
  entry,
  source,
  active,
  bucket,
  onSelect,
}: {
  entry: FeedEntry;
  source: SubscriptionSource | null;
  active: boolean;
  bucket: Bucket;
  onSelect: (entry: FeedEntry) => void;
}) {
  const isUnread = entry.read_at == null;
  const thumbnail = entry.cover_image || null;
  const sourceTitle = source?.title || '';
  const [thumbFailed, setThumbFailed] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(false);

  // 标题超过 3 行才加 fade mask（短标题不淡化）
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setTitleOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [entry.title]);

  // 双 mask layer + 默认 source-over composite (两层 alpha 相加)：
  // layer1 垂直切——第 1 行 alpha=1，第 2 行 alpha=0；
  // layer2 水平 fade——所有行右尾部 32px 渐隐；
  // add 后视觉：第 1 行完全可见 (max(1, fade)=1)，仅第 2 行尾部水平 fade，最后几字渐隐。
  const titleFadeMask =
    'linear-gradient(to bottom, black calc(1.375em * 1), transparent calc(1.375em * 1)), linear-gradient(to right, black calc(100% - 32px), transparent)';
  const titleFadeStyle = titleOverflow
    ? { maskImage: titleFadeMask, WebkitMaskImage: titleFadeMask }
    : undefined;

  return (
    <div
      onClick={() => onSelect(entry)}
      className={`px-3 py-2.5 rounded-lg cursor-pointer flex items-start gap-2 transition-colors ${
        active
          ? 'bg-black/[0.10] dark:bg-white/[0.12]'
          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
      }`}
    >
      {/* 左：标题 + 来源 · 时间 */}
      <div className="min-w-0 flex-1">
        <div
          ref={titleRef}
          style={titleFadeStyle}
          className={`text-[13px] leading-snug max-h-[calc(1.375em*2)] overflow-hidden break-words ${
            isUnread
              ? 'font-medium text-stone-900 dark:text-stone-100'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {entry.title || '无标题'}
        </div>
        <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 flex items-center gap-1">
          <span className="shrink-0 tabular-nums">{formatListItemDate(entryTimestamp(entry), bucket)}</span>
          {sourceTitle && (
            <>
              <span className="shrink-0 text-stone-300 dark:text-stone-600">·</span>
              {/* 作者/来源占满剩余宽度，左对齐流动；过长时右尾渐隐（mask），不用省略号 */}
              <span className="min-w-0 flex-1 whitespace-nowrap overflow-hidden" style={META_FADE_STYLE}>
                {sourceTitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 右：缩略图（无图时直接不渲染，title 自然占满整行宽） */}
      {thumbnail && !thumbFailed && (
        <img
          src={thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-12 h-12 rounded-md shrink-0 object-cover bg-stone-200/40 dark:bg-stone-700/40 self-center"
          onError={() => setThumbFailed(true)}
        />
      )}
    </div>
  );
}
