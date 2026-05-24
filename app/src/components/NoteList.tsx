import { AnimatePresence, motion } from 'framer-motion';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Note } from '../types';
import { BUCKET_LABEL, groupByBucket, type Bucket } from '../lib/dateBuckets';

type Props = {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
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
  onDelete,
  hidden = false,
}: Props) {
  const groups = groupByBucket(notes);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-56'}`}
    >
      <div className="flex-1 overflow-y-auto notelist-scroll">
        {/* 自定义滚动条：默认完全透明（不常驻），hover sidebar 时才浮出
            +2px transparent border + background-clip 让 thumb 视觉变细变短 */}
        <style>{`
          .notelist-scroll::-webkit-scrollbar { width: 8px; }
          .notelist-scroll::-webkit-scrollbar-track { background: transparent; }
          .notelist-scroll::-webkit-scrollbar-thumb {
            background: transparent;
            border: 2px solid transparent;
            background-clip: padding-box;
            border-radius: 999px;
            transition: background 200ms;
          }
          .notelist-scroll:hover::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.20);
            background-clip: padding-box;
          }
          .notelist-scroll:hover::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.32);
            background-clip: padding-box;
          }
          html.dark .notelist-scroll:hover::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.18);
            background-clip: padding-box;
          }
          html.dark .notelist-scroll:hover::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.32);
            background-clip: padding-box;
          }
        `}</style>
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
                <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              <AnimatePresence initial={false} mode="popLayout">
              {g.items.map(n => (
                <ContextMenu.Root key={n.id}>
                  <ContextMenu.Trigger asChild>
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94, x: -16 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 0.61, 0.36, 1],
                        layout: { duration: 0.24, ease: [0.22, 0.61, 0.36, 1] },
                      }}
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
                        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 mt-0.5 tabular-nums">
                          {fmt(n.updated_at, g.bucket)}
                        </div>
                      </div>
                    </motion.div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className="min-w-[200px] p-1.5 rounded-2xl bg-white/85 dark:bg-stone-800/90 backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)] z-50"
                    >
                      <ContextMenu.Item
                        onSelect={() => onDelete(n.id)}
                        className="flex items-center gap-3 px-3 py-2 text-[14px] text-red-600 dark:text-red-400 rounded-lg outline-none cursor-pointer data-[highlighted]:bg-red-500/10 dark:data-[highlighted]:bg-red-500/15 transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>删除</span>
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              ))}
              </AnimatePresence>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
