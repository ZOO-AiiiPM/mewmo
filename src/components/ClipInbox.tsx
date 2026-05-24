import type { Clip } from '../types';
import { BUCKET_LABEL, groupByBucket, type Bucket } from '../lib/dateBuckets';

type Props = {
  clips: Clip[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  hidden?: boolean;
};

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 时间戳按桶分类显示：今天 HH:mm / 昨日 / 本周 周X / 本月本年 M/D / 更早 YY/M/D */
function fmt(ts: number, bucket: Bucket): string {
  const d = new Date(ts * 1000);
  switch (bucket) {
    case 'today':
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    case 'yesterday':
      return '昨日';
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

export function ClipInbox({ clips, selectedId, onSelect, hidden = false }: Props) {
  const groups = groupByBucket(clips, c => c.saved_at);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-72'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {clips.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-[13px] leading-relaxed">
            <div className="mb-1.5 text-2xl">🔗</div>
            <div>还没有剪藏</div>
            <div className="text-stone-400 dark:text-stone-500 text-[11px] mt-1">
              在右上角点 ⊕ 添加链接
            </div>
          </div>
        ) : (
          groups.map((g, idx) => (
            <section key={g.bucket}>
              <h2 className={`sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none border-b border-black/[0.1] dark:border-white/[0.1] ${idx > 0 ? 'border-t' : ''}`}>
                <span>{BUCKET_LABEL[g.bucket]}</span>
                <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              {g.items.map(c => (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group relative pl-10 pr-3 py-2.5 cursor-pointer transition-colors ${
                    selectedId === c.id
                      ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {c.favicon_url ? (
                      <img
                        src={c.favicon_url}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-4 h-4 mt-0.5 rounded-sm shrink-0 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="w-4 h-4 mt-0.5 rounded-sm shrink-0 bg-stone-300 dark:bg-stone-600" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 pr-10">
                        {c.title || '无标题'}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-1 truncate">
                        <span className="truncate">{c.site_name || '未知来源'}</span>
                        <span className="text-stone-300 dark:text-stone-600">·</span>
                        <span className="shrink-0 tabular-nums">{fmt(c.saved_at, g.bucket)}</span>
                      </div>
                    </div>
                    {c.cover_image && (
                      <img
                        src={c.cover_image}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-md shrink-0 object-cover bg-stone-200/40 dark:bg-stone-700/40 self-center"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
