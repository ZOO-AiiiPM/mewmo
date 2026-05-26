import { useState } from 'react';
import type { FeedEntry, SubscriptionSource } from '../types';
import { BUCKET_LABEL, getBucket, type Bucket } from '../lib/dateBuckets';

type Props = {
  entries: FeedEntry[];
  source: SubscriptionSource | null;
  selectedId: number | null;
  onSelect: (entry: FeedEntry) => void;
  hidden?: boolean;
};

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function fmt(ts: number, bucket: Bucket): string {
  const d = new Date(ts * 1000);
  switch (bucket) {
    case 'today':
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    case 'yesterday':
      return '昨天';
    case 'week':
      return WEEKDAY[d.getDay()];
    case 'month':
    case 'year':
      return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    case 'older':
    default:
      return d.toLocaleDateString('zh-CN', { year: '2-digit', month: 'numeric', day: 'numeric' });
  }
}

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

/** 从 content_html 提取首张 image src 当 entry 缩略图；找不到返回 null */
function extractThumbnail(html: string): string | null {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export function EntryList({ entries, source, selectedId, onSelect, hidden = false }: Props) {
  const groups = groupEntries(entries);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-80'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
            选个订阅源看看
          </div>
        ) : (
          groups.map((g, idx) => (
            <section key={g.bucket}>
              <h2
                className={`sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/95 dark:bg-stone-900/95 select-none border-b border-black/[0.1] dark:border-white/[0.1] ${idx > 0 ? 'border-t' : ''}`}
              >
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
  const thumbnail = extractThumbnail(entry.content_html);
  const sourceTitle = source?.title || '';
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <div
      onClick={() => onSelect(entry)}
      className={`px-3 py-3 cursor-pointer flex items-start gap-3 border-b border-black/[0.05] dark:border-white/[0.05] transition-colors ${
        active
          ? 'bg-black/[0.06] dark:bg-white/[0.08]'
          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
      }`}
    >
      {/* 左：标题 + 来源 · 时间 */}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[14px] leading-snug line-clamp-3 ${
            isUnread
              ? 'font-medium text-stone-900 dark:text-stone-100'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {entry.title || '无标题'}
        </div>
        <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1.5 truncate">
          {sourceTitle}
          {sourceTitle && ' · '}
          {fmt(entryTimestamp(entry), bucket)}
        </div>
      </div>

      {/* 右：缩略图占位（始终 60×60 不延伸 title；无图时透明同背景，有图时渲染） */}
      <div
        className="shrink-0 rounded-lg overflow-hidden"
        style={{ width: 60, height: 60 }}
      >
        {thumbnail && !thumbFailed && (
          <img
            src={thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
