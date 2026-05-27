import { AnimatePresence, motion } from 'framer-motion';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Note } from '../types';
import { BUCKET_LABEL, formatListItemDate, groupByBucket } from '../lib/dateBuckets';

type Props = {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  hidden?: boolean;
};

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  hidden = false,
}: Props) {
  const groups = groupByBucket(notes, n => n.created_at);

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-56'}`}
    >
      <div className="flex-1 overflow-y-auto sidebar-scroll">
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
              <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                {idx > 0 && <div className="absolute top-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />}
                <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                <span>{BUCKET_LABEL[g.bucket]}</span>
                <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              <AnimatePresence initial={false} mode="popLayout">
              {g.items.map(n => (
                <ContextMenu.Root key={n.id}>
                  <ContextMenu.Trigger asChild>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94, x: -16 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 0.61, 0.36, 1],
                      }}
                      onClick={() => onSelect(n.id)}
                      className={`pl-10 pr-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        selectedId === n.id
                          ? 'bg-black/[0.10] dark:bg-white/[0.12]'
                          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate pr-12">
                            {n.title || '无标题'}
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                            {n.content_md.replace(/[#*_`>\n]/g, ' ').slice(0, 40) || '空笔记'}
                          </div>
                        </div>
                        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 mt-0.5 tabular-nums">
                          {formatListItemDate(n.created_at, g.bucket)}
                        </div>
                      </div>
                    </motion.div>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className="min-w-[200px] p-1.5 rounded-2xl bg-white dark:bg-stone-800 ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)] z-50"
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
