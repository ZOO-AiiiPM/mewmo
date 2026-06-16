import { useState, useCallback, useEffect } from 'react';
import { listKbs, createKb, listKbContents } from '../lib/kb';
import type { KnowledgeBase as KBType, KbFolderEntry, KbNoteEntry, KbContents } from '../types';

// ─── Icons ──────────────────────────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

type BreadcrumbItem = { id: string; label: string };

function Breadcrumb({ items, onNavigate }: { items: BreadcrumbItem[]; onNavigate: (index: number) => void }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 text-[12px] text-stone-500 dark:text-stone-400 overflow-x-auto">
      {items.map((item, i) => (
        <span key={item.id} className="flex items-center gap-1 shrink-0">
          {i > 0 && <ChevronRight />}
          <button
            onClick={() => onNavigate(i)}
            className={`hover:text-stone-900 dark:hover:text-stone-100 transition-colors truncate max-w-[120px] ${
              i === items.length - 1 ? 'text-stone-900 dark:text-stone-100 font-medium' : ''
            }`}
          >
            {item.label}
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Library Folder Icon (大号，带颜色) ────────────────────────────────────

const FOLDER_COLORS = [
  { bg: 'from-blue-400 to-blue-500', shadow: 'shadow-blue-500/20' },
  { bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/20' },
  { bg: 'from-emerald-400 to-emerald-500', shadow: 'shadow-emerald-500/20' },
  { bg: 'from-violet-400 to-violet-500', shadow: 'shadow-violet-500/20' },
  { bg: 'from-rose-400 to-rose-500', shadow: 'shadow-rose-500/20' },
];

const COLOR_NAME_TO_INDEX: Record<string, number> = {
  blue: 0, amber: 1, emerald: 2, violet: 3, rose: 4,
};

function colorIndex(color: string): number {
  return COLOR_NAME_TO_INDEX[color] ?? 0;
}

function LibraryFolderIcon({ colorIndex: ci }: { colorIndex: number }) {
  const color = FOLDER_COLORS[ci % FOLDER_COLORS.length];
  return (
    <div className={`w-16 h-13 rounded-xl bg-gradient-to-br ${color.bg} ${color.shadow} shadow-lg relative overflow-hidden`}>
      <div className="absolute top-0 left-0 w-6 h-3 bg-white/20 rounded-br-lg" />
      <div className="absolute bottom-2 left-2 right-2 top-5 bg-white/10 rounded" />
    </div>
  );
}

// ─── Library List (第一层 - 网格卡片视图) ────────────────────────────────────

function LibraryList({ libraries, onOpen, onCreate }: {
  libraries: KBType[];
  onOpen: (lib: KBType) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll">
      <div className="p-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {/* 新建知识库 */}
        <div
          onClick={onCreate}
          className="flex flex-col items-center gap-3 p-5 rounded-2xl cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
        >
          <div className="w-16 h-13 rounded-xl bg-gradient-to-br from-stone-300 to-stone-400 dark:from-stone-600 dark:to-stone-700 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-6 h-3 bg-white/30 rounded-br-lg" />
            <div className="absolute bottom-2 left-2 right-2 top-5 bg-white/20 rounded flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </div>
          </div>
          <span className="text-[13px] text-stone-500 dark:text-stone-400 font-medium">
            新建知识库
          </span>
        </div>
        {libraries.map((lib) => (
          <div
            key={lib.dir_name}
            onClick={() => onOpen(lib)}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
          >
            <LibraryFolderIcon colorIndex={colorIndex(lib.color)} />
            <div className="text-center w-full">
              <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">
                {lib.name}
              </div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                {lib.note_count} 篇
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Folder Contents (第二层+) ──────────────────────────────────────────────

function FolderContents({ folders, notes, onOpenFolder, onOpenNote, selectedNoteSlug }: {
  folders: KbFolderEntry[];
  notes: KbNoteEntry[];
  onOpenFolder: (folder: KbFolderEntry) => void;
  onOpenNote: (note: KbNoteEntry) => void;
  selectedNoteSlug: string | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll">
      {/* 子文件夹区域 */}
      {folders.length > 0 && (
        <div className="px-2 pt-1 pb-1">
          <div className="px-3 py-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
            文件夹
          </div>
          <div className="space-y-0.5">
            {folders.map(folder => (
              <div
                key={folder.path}
                onClick={() => onOpenFolder(folder)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
              >
                <span className="shrink-0 text-stone-500 dark:text-stone-400">
                  <FolderIcon />
                </span>
                <span className="flex-1 text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">
                  {folder.name}
                </span>
                <span className="shrink-0 text-stone-400 dark:text-stone-500">
                  <ChevronRight />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分隔线 */}
      {folders.length > 0 && notes.length > 0 && (
        <div className="mx-3 border-t border-black/[0.06] dark:border-white/[0.06]" />
      )}

      {/* 笔记列表 */}
      {notes.length > 0 && (
        <div className="px-2 pt-1 pb-2">
          {folders.length > 0 && (
            <div className="px-3 py-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              笔记
            </div>
          )}
          <div className="space-y-0.5">
            {notes.map(note => (
              <div
                key={note.slug}
                onClick={() => onOpenNote(note)}
                className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedNoteSlug === note.slug
                    ? 'bg-black/[0.10] dark:bg-white/[0.12]'
                    : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">
                      {note.title}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                      {note.preview}
                    </div>
                  </div>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 shrink-0 mt-0.5 tabular-nums">
                    {formatDate(note.updated_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {folders.length === 0 && notes.length === 0 && (
        <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-sm">
          <div className="mb-2">空文件夹</div>
          <div className="text-[11px]">拖入笔记或新建内容</div>
        </div>
      )}
    </div>
  );
}

// ─── File Reader (右侧内容区) ───────────────────────────────────────────────

function NoteReader({ note }: { note: KbNoteEntry | null }) {
  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-500 text-sm">
        选择一篇笔记开始阅读
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-4">
        {note.title}
      </h1>
      <p className="text-[14px] text-stone-700 dark:text-stone-300 leading-relaxed">
        {note.preview}
      </p>
      <p className="text-[14px] text-stone-500 dark:text-stone-400 leading-relaxed mt-4 italic">
        完整内容将在编辑器集成后显示。
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

type NavEntry = { dirName: string; relativePath?: string; label: string };

export function KnowledgeBase({ hidden = false }: { hidden?: boolean }) {
  // KB list (root layer)
  const [kbs, setKbs] = useState<KBType[]>([]);
  const [loadingKbs, setLoadingKbs] = useState(true);

  // Navigation stack: empty = root, [0] = KB root, [1+] = subfolders
  const [navStack, setNavStack] = useState<NavEntry[]>([]);

  // Contents of current folder
  const [contents, setContents] = useState<KbContents>({ folders: [], notes: [] });
  const [loadingContents, setLoadingContents] = useState(false);

  // Selected note in reader
  const [selectedNote, setSelectedNote] = useState<KbNoteEntry | null>(null);

  const isAtRoot = navStack.length === 0;

  // Fetch KB list on mount
  useEffect(() => {
    setLoadingKbs(true);
    listKbs()
      .then(setKbs)
      .catch(console.error)
      .finally(() => setLoadingKbs(false));
  }, []);

  // Fetch contents when navStack changes (not at root)
  useEffect(() => {
    if (navStack.length === 0) return;
    const current = navStack[navStack.length - 1];
    setLoadingContents(true);
    listKbContents(current.dirName, current.relativePath)
      .then(setContents)
      .catch((err) => {
        console.error(err);
        setContents({ folders: [], notes: [] });
      })
      .finally(() => setLoadingContents(false));
  }, [navStack]);

  const openKb = useCallback((kb: KBType) => {
    setNavStack([{ dirName: kb.dir_name, label: kb.name }]);
    setSelectedNote(null);
  }, []);

  const openFolder = useCallback((folder: KbFolderEntry) => {
    setNavStack(prev => {
      const parent = prev[prev.length - 1];
      return [...prev, { dirName: parent.dirName, relativePath: folder.path, label: folder.name }];
    });
    setSelectedNote(null);
  }, []);

  const navigateTo = useCallback((index: number) => {
    // index -1 = back to root
    if (index < 0) {
      setNavStack([]);
      setSelectedNote(null);
      return;
    }
    setNavStack(prev => prev.slice(0, index + 1));
    setSelectedNote(null);
  }, []);

  const handleCreate = useCallback(async () => {
    const name = window.prompt('知识库名称');
    if (!name?.trim()) return;
    try {
      const kb = await createKb(name.trim());
      setKbs(prev => [...prev, kb]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Root layer: grid of KB cards
  if (isAtRoot) {
    return (
      <div className={`flex flex-col h-full overflow-hidden ${hidden ? 'w-0' : 'flex-1'}`}>
        <div className="shrink-0 h-12 flex items-center px-5">
          <span className="text-[15px] font-bold text-stone-900 dark:text-stone-100">
            知识库
          </span>
        </div>
        {loadingKbs ? (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">加载中…</div>
        ) : (
          <LibraryList
            libraries={kbs}
            onOpen={openKb}
            onCreate={handleCreate}
          />
        )}
      </div>
    );
  }

  // Drill-in layer: left aside + right reader
  const breadcrumbItems: BreadcrumbItem[] = [
    { id: 'root', label: '知识库' },
    ...navStack.map((entry, i) => ({ id: `nav-${i}`, label: entry.label })),
  ];

  return (
    <div className={`flex h-full overflow-hidden ${hidden ? 'w-0' : ''}`}>
      <aside className="shrink-0 w-56 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden">
        <div className="shrink-0 min-h-[48px] flex flex-col justify-center border-b border-black/[0.06] dark:border-white/[0.06]">
          <Breadcrumb
            items={breadcrumbItems}
            onNavigate={(i) => navigateTo(i - 1)}
          />
        </div>
        {loadingContents ? (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">加载中…</div>
        ) : (
          <FolderContents
            folders={contents.folders}
            notes={contents.notes}
            onOpenFolder={openFolder}
            onOpenNote={setSelectedNote}
            selectedNoteSlug={selectedNote?.slug ?? null}
          />
        )}
      </aside>
      <NoteReader note={selectedNote} />
    </div>
  );
}
