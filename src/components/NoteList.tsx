import type { Note } from '../types';

type Props = {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
};

function fmt(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  if (same) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function NoteList({ notes, selectedId, onSelect, onCreate, onDelete }: Props) {
  return (
    <aside className="w-72 border-r border-stone-200 dark:border-stone-800 flex flex-col bg-stone-50 dark:bg-stone-950">
      <div className="p-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
        <h1 className="text-sm font-medium text-stone-700 dark:text-stone-300">笔记</h1>
        <button
          onClick={onCreate}
          className="px-2 py-1 text-xs rounded bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          + 新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="p-6 text-center text-stone-400 text-sm">
            <div className="mb-2">还没有笔记 ✨</div>
            <button
              onClick={onCreate}
              className="text-stone-600 dark:text-stone-400 underline hover:text-stone-900 dark:hover:text-stone-100"
            >
              写下第一条
            </button>
          </div>
        ) : (
          notes.map(n => (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`group relative px-3 py-2.5 border-b border-stone-200/60 dark:border-stone-800/60 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-900 ${
                selectedId === n.id ? 'bg-stone-200 dark:bg-stone-800' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate pr-12">
                    {n.title || '无标题'}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-500 mt-0.5 truncate">
                    {n.content_md.replace(/[#*_`>\n]/g, ' ').slice(0, 40) || '空笔记'}
                  </div>
                </div>
                <div className="text-xs text-stone-400 shrink-0">{fmt(n.updated_at)}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('删除这条笔记？')) onDelete(n.id);
                }}
                className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 px-1.5 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 transition-opacity"
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
