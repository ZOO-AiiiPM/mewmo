import type { Note } from '../types';
import { BUCKET_LABEL, formatListItemDate, groupByBucket, type Bucket } from '../lib/dateBuckets';
import { ListItemContextMenu } from './ListItemContextMenu';

type Props = {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  onReveal?: (id: string) => void;
  hidden?: boolean;
};

function PinIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ transform: 'rotate(-45deg)' }}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

function NoteItem({ n, selected, onSelect, bucket }: { n: Note; selected: boolean; onSelect: () => void; bucket: Bucket }) {
  return (
    <div
      onClick={onSelect}
      className={`relative pl-10 pr-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        selected
          ? 'bg-black/[0.10] dark:bg-white/[0.12]'
          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
      }`}
    >
      {n.pinned && (
        <div className="absolute left-3 top-3.5">
          <PinIcon className="text-stone-900 dark:text-stone-100" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate pr-1">
            {n.title || '无标题'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
            {n.format === 'html'
              ? '导入的 HTML 文件'
              : (n.content_md || n.preview || '').replace(/[#*_`>\n]/g, ' ').slice(0, 40) || '空笔记'}
          </div>
        </div>
        <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 mt-0.5 tabular-nums">
          {formatListItemDate(n.created_at, bucket)}
        </div>
      </div>
    </div>
  );
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onPin,
  onReveal,
  hidden = false,
}: Props) {
  const pinnedNotes = notes.filter(n => n.pinned);
  const unpinnedNotes = notes.filter(n => !n.pinned);
  const groups = groupByBucket(unpinnedNotes, n => n.created_at);

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
          <>
            {pinnedNotes.length > 0 && (
              <section>
                <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                  <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                  <span>置顶</span>
                  <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                    {pinnedNotes.length}
                  </span>
                </h2>
                {pinnedNotes.map((n, i) => (
                  <ListItemContextMenu key={n.id} onDelete={() => onDelete(n.id)} onPin={onPin ? () => onPin(n.id, !n.pinned) : undefined} pinLabel="取消置顶" onReveal={onReveal ? () => onReveal(n.id) : undefined}>
                    <div className="relative">
                      {i > 0 && <div className="absolute top-0 left-10 right-3 h-px bg-black/[0.06] dark:bg-white/[0.06]" />}
                      <NoteItem n={n} selected={selectedId === n.id} onSelect={() => onSelect(n.id)} bucket={"today" as Bucket} />
                    </div>
                  </ListItemContextMenu>
                ))}
              </section>
            )}
            {groups.map((g, idx) => (
              <section key={g.bucket}>
                <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                  {(idx > 0 || pinnedNotes.length > 0) && <div className="absolute top-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />}
                  <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                  <span>{BUCKET_LABEL[g.bucket]}</span>
                  <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                    {g.items.length}
                  </span>
                </h2>
                {g.items.map((n, i) => (
                  <ListItemContextMenu key={n.id} onDelete={() => onDelete(n.id)} onPin={onPin ? () => onPin(n.id, !n.pinned) : undefined} pinLabel="置顶" onReveal={onReveal ? () => onReveal(n.id) : undefined}>
                    <div className="relative">
                      {i > 0 && <div className="absolute top-0 left-10 right-3 h-px bg-black/[0.06] dark:bg-white/[0.06]" />}
                      <NoteItem n={n} selected={selectedId === n.id} onSelect={() => onSelect(n.id)} bucket={g.bucket} />
                    </div>
                  </ListItemContextMenu>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
