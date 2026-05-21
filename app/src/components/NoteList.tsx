import type { Note } from '../types';
import { BUCKET_LABEL, groupByBucket, type Bucket } from '../lib/dateBuckets';

type Props = {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
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

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  hidden = false,
}: Props) {
  const groups = groupByBucket(notes);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-56'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
            <div className="mb-2">还没有笔记 ✨</div>
            <button
              onClick={onCreate}
              className="text-stone-700 dark:text-stone-200 underline hover:text-stone-900 dark:hover:text-stone-100"
            >
              写下第一条
            </button>
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
              {g.items.map(n => (
                <div
                  key={n.id}
                  onClick={() => onSelect(n.id)}
                  className={`pl-10 pr-3 py-2.5 cursor-pointer transition-colors ${
                    selectedId === n.id
                      ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium text-stone-900 dark:text-stone-100 truncate pr-12">
                        {n.title || '无标题'}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                        {n.content_md.replace(/[#*_`>\n]/g, ' ').slice(0, 40) || '空笔记'}
                      </div>
                    </div>
                    <div className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0 mt-0.5 tabular-nums">
                      {fmt(n.updated_at, g.bucket)}
                    </div>
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
