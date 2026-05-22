import type { FeedEntry } from '../types';
import { BUCKET_LABEL, getBucket, type Bucket } from '../lib/dateBuckets';

type Props = {
  entries: FeedEntry[];
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

export function EntryList({ entries, selectedId, onSelect, hidden = false }: Props) {
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
                className={`sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none border-b border-black/[0.1] dark:border-white/[0.1] ${idx > 0 ? 'border-t' : ''}`}
              >
                <span>{BUCKET_LABEL[g.bucket]}</span>
                <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              {g.items.map(e => {
                const isUnread = e.read_at == null;
                const isActive = selectedId === e.id;
                return (
                  <div
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className={`px-3 py-3 cursor-pointer flex items-start gap-2 border-b border-black/[0.05] dark:border-white/[0.05] transition-colors ${
                      isActive
                        ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* unread dot */}
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                      style={{ background: isUnread ? '#d97757' : 'transparent' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`text-[14px] leading-snug line-clamp-2 ${
                            isUnread
                              ? 'font-medium text-stone-900 dark:text-stone-100'
                              : 'text-stone-500 dark:text-stone-400'
                          }`}
                        >
                          {e.title || '无标题'}
                        </div>
                        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0 tabular-nums whitespace-nowrap">
                          {fmt(entryTimestamp(e), g.bucket)}
                        </span>
                      </div>
                      {e.excerpt && (
                        <div className="text-[12px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
                          {e.excerpt}
                        </div>
                      )}
                      {e.author && (
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 truncate">
                          {e.author}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
