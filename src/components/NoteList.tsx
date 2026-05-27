import type { Note } from '../types';
import { BUCKET_LABEL, formatListItemDate, groupByBucket } from '../lib/dateBuckets';
import { ListItemContextMenu } from './ListItemContextMenu';

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
              {g.items.map(n => (
                <ListItemContextMenu key={n.id} onDelete={() => onDelete(n.id)}>
                  <div
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
                  </div>
                </ListItemContextMenu>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
