import * as ContextMenu from '@radix-ui/react-context-menu';
import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteNote, getClip, getNote, listClips, listNotes, updateNote } from '../lib/db';
import {
  createKb,
  createKbFolder,
  createKbNote,
  deleteKb,
  deleteKbFolder,
  importKbFolder,
  listKbContents,
  listKbs,
  renameKbFolder,
  updateKbMeta,
} from '../lib/kb';
import { addSubscription } from '../lib/subscription';
import type { Clip, KnowledgeBase as KBType, KbContents, KbFolderEntry, KbNoteEntry, Note } from '../types';
import { AddSourceDialog } from './AddSourceDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { NoteEditor } from './NoteEditor';

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function NoteIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function RssIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ActionMenuItem({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
        danger
          ? 'text-red-600 hover:bg-red-500/[0.08] dark:text-red-400'
          : 'text-stone-700 hover:bg-black/[0.04] dark:text-stone-200 dark:hover:bg-white/[0.06]'
      }`}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function Disclosure({ open }: { open: boolean }) {
  return (
    <span className={`grid h-4 w-4 shrink-0 place-items-center text-[10px] text-stone-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
      ▶
    </span>
  );
}

const FOLDER_COLORS = [
  { key: 'blue', label: '蓝', bg: 'from-blue-400 to-blue-500', shadow: 'shadow-blue-500/20' },
  { key: 'amber', label: '橙', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/20' },
  { key: 'emerald', label: '绿', bg: 'from-emerald-400 to-emerald-500', shadow: 'shadow-emerald-500/20' },
  { key: 'violet', label: '紫', bg: 'from-violet-400 to-violet-500', shadow: 'shadow-violet-500/20' },
  { key: 'rose', label: '红', bg: 'from-rose-400 to-rose-500', shadow: 'shadow-rose-500/20' },
];

const COLOR_NAME_TO_INDEX: Record<string, number> = {
  blue: 0,
  amber: 1,
  emerald: 2,
  violet: 3,
  rose: 4,
};

function colorIndex(color: string): number {
  return COLOR_NAME_TO_INDEX[color] ?? 0;
}

function LibraryFolderIcon({ colorIndex: ci }: { colorIndex: number }) {
  const color = FOLDER_COLORS[ci % FOLDER_COLORS.length];
  return (
    <div className={`relative h-8 w-7 overflow-hidden rounded-md bg-gradient-to-br ${color.bg}`}>
      <div className="absolute inset-x-1 inset-y-1.5 rounded-sm bg-white/30" />
    </div>
  );
}

function LibraryList({ libraries, onOpen, onCreate, onEdit, onDelete }: {
  libraries: KBType[];
  onOpen: (lib: KBType) => void;
  onCreate: () => void;
  onEdit: (lib: KBType) => void;
  onDelete: (lib: KBType) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto sidebar-scroll">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 p-5">
        <button
          type="button"
          onClick={onCreate}
          className="group flex min-h-[130px] flex-col items-start gap-3 rounded-2xl border border-stone-200/60 bg-stone-50/50 p-5 transition-colors hover:bg-stone-100/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-stone-200/80 dark:bg-stone-700/60">
            <PlusIcon />
          </div>
          <div className="text-left">
            <div className="text-[14px] font-semibold text-stone-600 dark:text-stone-300">新建知识库</div>
            <div className="mt-0.5 text-[12px] text-stone-400 dark:text-stone-500">点击创建新的空间</div>
          </div>
        </button>
        {libraries.map((lib) => (
          <div
            key={lib.dir_name}
            className="group relative min-h-[130px] rounded-2xl border border-stone-200/60 transition-colors hover:bg-black/[0.03] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
          >
            <button
              type="button"
              onClick={() => onOpen(lib)}
              className="flex h-full w-full flex-col items-start gap-3 rounded-2xl p-5"
            >
              <LibraryFolderIcon colorIndex={colorIndex(lib.color)} />
              <div className="w-full text-left">
                <div className="truncate text-[15px] font-bold text-stone-900 dark:text-stone-100">{lib.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-stone-500 dark:text-stone-400">
                  <span>{lib.note_count} 篇</span>
                  <span className="text-stone-300 dark:text-stone-600">·</span>
                  <span>更新于 {formatDate(lib.updated_at)}</span>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === lib.dir_name ? null : lib.dir_name);
              }}
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-stone-400 opacity-0 transition-all hover:bg-black/[0.06] hover:text-stone-700 group-hover:opacity-100 dark:hover:bg-white/[0.08] dark:hover:text-stone-100"
              title="更多"
            >
              <MoreIcon />
            </button>
            {openMenu === lib.dir_name && (
              <div className="absolute right-3 top-11 z-20 w-36 overflow-hidden rounded-xl bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.06] dark:bg-stone-800 dark:ring-white/[0.08]">
                <ActionMenuItem
                  icon={<EditIcon />}
                  label="编辑"
                  onClick={() => {
                    setOpenMenu(null);
                    onEdit(lib);
                  }}
                />
                <ActionMenuItem
                  icon={<TrashIcon />}
                  label="删除"
                  danger
                  onClick={() => {
                    setOpenMenu(null);
                    onDelete(lib);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

function parentPath(path?: string): string | undefined {
  if (!path) return undefined;
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : undefined;
}

function makeChildPath(parent: string | undefined, child: string) {
  return parent ? `${parent}/${child}` : child;
}

function isInsidePath(path: string, folderPath: string) {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

function ContextMenuContent({ onRename, onDelete }: { onRename?: () => void; onDelete: () => void }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-[140px] rounded-xl bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:bg-stone-800 dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        {onRename && (
          <ContextMenu.Item
            onSelect={onRename}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-stone-700 outline-none transition-colors data-[highlighted]:bg-stone-100 dark:text-stone-200 dark:data-[highlighted]:bg-stone-700"
          >
            <EditIcon />
            <span>重命名</span>
          </ContextMenu.Item>
        )}
        <ContextMenu.Item
          onSelect={onDelete}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-red-600 outline-none transition-colors data-[highlighted]:bg-red-500 data-[highlighted]:text-white dark:text-red-400 dark:data-[highlighted]:bg-red-500 dark:data-[highlighted]:text-white"
        >
          <TrashIcon />
          <span>删除</span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function KbFormDialog({
  open,
  mode,
  initialName,
  initialColor,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialColor?: string;
  onClose: () => void;
  onSubmit: (values: { name: string; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [color, setColor] = useState(initialColor ?? 'blue');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? '');
    setColor(initialColor ?? 'blue');
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [initialColor, initialName, open]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), color });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-[392px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/[0.06] dark:bg-stone-800 dark:ring-white/[0.08]"
          >
            <div className="px-5 pt-5">
              <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-50">
                {mode === 'create' ? '新建知识库' : '编辑知识库'}
              </h2>
              <div className="mt-4">
                <label className="text-[12px] font-medium text-stone-500 dark:text-stone-400">标题</label>
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit();
                    if (e.key === 'Escape') onClose();
                  }}
                  placeholder="知识库名称"
                  className="mt-1.5 h-10 w-full rounded-xl border border-black/[0.08] bg-black/[0.03] px-3 text-[14px] font-medium text-stone-900 outline-none transition-colors focus:border-stone-400 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-stone-100 dark:focus:border-stone-500"
                />
              </div>
              <div className="mt-4">
                <div className="text-[12px] font-medium text-stone-500 dark:text-stone-400">颜色</div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {FOLDER_COLORS.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setColor(option.key)}
                      className={`flex h-14 items-center justify-center rounded-xl border transition-colors ${
                        color === option.key
                          ? 'border-stone-900 bg-black/[0.04] dark:border-stone-100 dark:bg-white/[0.08]'
                          : 'border-transparent bg-black/[0.025] hover:bg-black/[0.045] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
                      }`}
                      title={option.label}
                    >
                      <span className={`h-7 w-9 rounded-lg bg-gradient-to-br ${option.bg}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-black/[0.06] bg-stone-50 px-5 py-3 dark:border-white/[0.06] dark:bg-stone-900/50">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-black/[0.05] disabled:opacity-50 dark:text-stone-300 dark:hover:bg-white/[0.06]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !name.trim()}
                className="rounded-lg bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
              >
                {mode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function KbImportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (selection: { noteIds: string[]; clipIds: string[] }) => Promise<void>;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [noteIds, setNoteIds] = useState<Set<string>>(new Set());
  const [clipIds, setClipIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNoteIds(new Set());
    setClipIds(new Set());
    Promise.all([listNotes(), listClips()])
      .then(([nextNotes, nextClips]) => {
        setNotes(nextNotes.filter(note => note.format === 'md' && !note.id.startsWith('library/')));
        setClips(nextClips);
      })
      .catch(console.error);
  }, [open]);

  const total = noteIds.size + clipIds.size;
  const toggle = (set: (next: Set<string>) => void, current: Set<string>, id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set(next);
  };

  const submit = async () => {
    if (total === 0 || busy) return;
    setBusy(true);
    try {
      await onSubmit({ noteIds: Array.from(noteIds), clipIds: Array.from(clipIds) });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex max-h-[72vh] w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/[0.06] dark:bg-stone-800 dark:ring-white/[0.08]"
          >
            <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-50">导入内容</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 text-[12px] font-semibold text-stone-500 dark:text-stone-400">笔记</div>
              <div className="space-y-1">
                {notes.slice(0, 80).map(note => (
                  <label key={note.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                    <input
                      type="checkbox"
                      checked={noteIds.has(note.id)}
                      onChange={() => toggle(setNoteIds, noteIds, note.id)}
                      className="h-4 w-4"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-800 dark:text-stone-100">{note.title || '无标题'}</span>
                    <span className="text-[11px] tabular-nums text-stone-400">{formatDate(note.updated_at)}</span>
                  </label>
                ))}
              </div>
              <div className="mb-3 mt-5 text-[12px] font-semibold text-stone-500 dark:text-stone-400">剪藏</div>
              <div className="space-y-1">
                {clips.slice(0, 80).map(clip => (
                  <label key={clip.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                    <input
                      type="checkbox"
                      checked={clipIds.has(clip.id)}
                      onChange={() => toggle(setClipIds, clipIds, clip.id)}
                      className="h-4 w-4"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-800 dark:text-stone-100">{clip.title || clip.url}</span>
                    <span className="text-[11px] tabular-nums text-stone-400">{formatDate(clip.saved_at)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] bg-stone-50 px-5 py-3 dark:border-white/[0.06] dark:bg-stone-900/50">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-black/[0.05] disabled:opacity-50 dark:text-stone-300 dark:hover:bg-white/[0.06]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || total === 0}
                className="rounded-lg bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
              >
                {busy ? '导入中…' : `导入 ${total || ''}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type TreeProps = {
  path?: string;
  contentsByPath: Record<string, KbContents>;
  expanded: Set<string>;
  activeFolderPath?: string;
  selectedNoteSlug: string | null;
  loadingPaths: Set<string>;
  onToggleFolder: (folder: KbFolderEntry) => void;
  onSelectFolder: (folder: KbFolderEntry) => void;
  onSelectNote: (note: KbNoteEntry, folderPath?: string) => void;
  onRenameFolder: (folder: KbFolderEntry) => void;
  onDeleteFolder: (folder: KbFolderEntry) => void;
  onDeleteNote: (note: KbNoteEntry, folderPath?: string) => void;
};

function TreeLevel({
  path,
  contentsByPath,
  expanded,
  activeFolderPath,
  selectedNoteSlug,
  loadingPaths,
  onToggleFolder,
  onSelectFolder,
  onSelectNote,
  onRenameFolder,
  onDeleteFolder,
  onDeleteNote,
}: TreeProps) {
  const key = path ?? '';
  const contents = contentsByPath[key] ?? { folders: [], notes: [] };

  return (
    <>
      {contents.folders.map(folder => {
        const isOpen = expanded.has(folder.path);
        const isActive = activeFolderPath === folder.path && selectedNoteSlug == null;
        return (
          <div key={folder.path}>
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onSelectFolder(folder);
                    onToggleFolder(folder);
                  }}
                  className={`flex min-h-9 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[13px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-black/[0.10] dark:bg-white/[0.12]'
                      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Disclosure open={isOpen} />
                  <FolderIcon className="shrink-0 text-stone-500 dark:text-stone-400" />
                  <span className="min-w-0 flex-1 truncate text-stone-900 dark:text-stone-100">{folder.name}</span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-400 dark:text-stone-500">{folder.count}</span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenuContent onRename={() => onRenameFolder(folder)} onDelete={() => onDeleteFolder(folder)} />
            </ContextMenu.Root>
            {isOpen && (
              <div className="ml-5 border-l border-black/[0.06] pl-2 dark:border-white/[0.08]">
                {loadingPaths.has(folder.path) ? (
                  <div className="px-2 py-2 text-[12px] text-stone-400">加载中…</div>
                ) : (
                  <TreeLevel
                    path={folder.path}
                    contentsByPath={contentsByPath}
                    expanded={expanded}
                    activeFolderPath={activeFolderPath}
                    selectedNoteSlug={selectedNoteSlug}
                    loadingPaths={loadingPaths}
                    onToggleFolder={onToggleFolder}
                    onSelectFolder={onSelectFolder}
                    onSelectNote={onSelectNote}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onDeleteNote={onDeleteNote}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {contents.notes.map(note => (
        <ContextMenu.Root key={note.slug}>
          <ContextMenu.Trigger asChild>
            <button
              type="button"
              onClick={() => onSelectNote(note, path)}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                selectedNoteSlug === note.slug
                  ? 'bg-black/[0.10] dark:bg-white/[0.12]'
                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
              }`}
            >
              <NoteIcon className="mt-0.5 shrink-0 text-stone-500 dark:text-stone-400" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] leading-tight text-stone-900 dark:text-stone-100 ${selectedNoteSlug === note.slug ? 'font-semibold' : 'font-medium'}`}>
                  {note.title || '无标题'}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] text-stone-400 dark:text-stone-500">
                  {note.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="inline-flex h-4 shrink-0 items-center rounded bg-black/[0.05] px-1.5 text-[10px] font-semibold text-stone-600 dark:bg-white/[0.08] dark:text-stone-300">
                      {tag}
                    </span>
                  ))}
                  <span className="shrink-0 tabular-nums">{formatDate(note.updated_at)}</span>
                </span>
              </span>
            </button>
          </ContextMenu.Trigger>
          <ContextMenuContent onDelete={() => onDeleteNote(note, path)} />
        </ContextMenu.Root>
      ))}
    </>
  );
}

export function KnowledgeBase({ hidden = false }: { hidden?: boolean }) {
  const [kbs, setKbs] = useState<KBType[]>([]);
  const [loadingKbs, setLoadingKbs] = useState(true);
  const [selectedKb, setSelectedKb] = useState<KBType | null>(null);
  const [contentsByPath, setContentsByPath] = useState<Record<string, KbContents>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeFolderPath, setActiveFolderPath] = useState<string | undefined>();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedNoteFolderPath, setSelectedNoteFolderPath] = useState<string | undefined>();
  const [loadingNote, setLoadingNote] = useState(false);
  const [kbDialog, setKbDialog] = useState<{ mode: 'create' } | { mode: 'edit'; kb: KBType } | null>(null);
  const [kbToDelete, setKbToDelete] = useState<KBType | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  const selectedNoteSlug = selectedNote?.id ?? null;

  const refreshKbList = useCallback(async () => {
    setLoadingKbs(true);
    try {
      setKbs(await listKbs());
    } finally {
      setLoadingKbs(false);
    }
  }, []);

  useEffect(() => {
    refreshKbList().catch(console.error);
  }, [refreshKbList]);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setEditorTheme(root.classList.contains('dark') ? 'dark' : 'light');
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const loadContents = useCallback(async (dirName: string, path?: string) => {
    const key = path ?? '';
    setLoadingPaths(prev => new Set(prev).add(key));
    try {
      const data = await listKbContents(dirName, path);
      setContentsByPath(prev => ({ ...prev, [key]: data }));
      return data;
    } finally {
      setLoadingPaths(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const openKb = useCallback((kb: KBType) => {
    setSelectedKb(kb);
    setContentsByPath({});
    setExpanded(new Set());
    setActiveFolderPath(undefined);
    setSelectedNote(null);
    setSelectedNoteFolderPath(undefined);
    loadContents(kb.dir_name).catch(console.error);
  }, [loadContents]);

  const handleSaveKb = useCallback(async (values: { name: string; color: string }) => {
    if (!kbDialog) return;
    if (kbDialog.mode === 'create') {
      const kb = await createKb(values.name, values.color);
      setKbs(prev => [...prev, kb]);
      return;
    }
    await updateKbMeta(kbDialog.kb.dir_name, { name: values.name, color: values.color });
    await refreshKbList();
  }, [kbDialog, refreshKbList]);

  const handleDeleteKb = useCallback(async () => {
    if (!kbToDelete) return;
    await deleteKb(kbToDelete.dir_name);
    if (selectedKb?.dir_name === kbToDelete.dir_name) {
      setSelectedKb(null);
      setSelectedNote(null);
      setSelectedNoteFolderPath(undefined);
      setActiveFolderPath(undefined);
    }
    setKbToDelete(null);
    await refreshKbList();
  }, [kbToDelete, refreshKbList, selectedKb]);

  const handleImportFolder = useCallback(async () => {
    try {
      const stats = await importKbFolder();
      if (!stats) return;
      await refreshKbList();
    } catch (e) {
      console.error('导入知识库失败:', e);
    }
  }, [refreshKbList]);

  const selectNote = useCallback(async (note: KbNoteEntry, folderPath?: string) => {
    setLoadingNote(true);
    setActiveFolderPath(folderPath);
    setSelectedNoteFolderPath(folderPath);
    try {
      const full = await getNote(note.slug);
      setSelectedNote(full);
    } catch (err) {
      console.error(err);
      setSelectedNote(null);
    } finally {
      setLoadingNote(false);
    }
  }, []);

  const refreshPath = useCallback(async (path?: string) => {
    if (!selectedKb) return;
    await loadContents(selectedKb.dir_name, path);
    await refreshKbList();
  }, [loadContents, refreshKbList, selectedKb]);

  const toggleFolder = useCallback((folder: KbFolderEntry) => {
    if (!selectedKb) return;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(folder.path)) {
        next.delete(folder.path);
      } else {
        next.add(folder.path);
        if (!contentsByPath[folder.path]) {
          loadContents(selectedKb.dir_name, folder.path).catch(console.error);
        }
      }
      return next;
    });
  }, [contentsByPath, loadContents, selectedKb]);

  const handleCreateNote = useCallback(async () => {
    if (!selectedKb) return;
    const targetPath = activeFolderPath;
    try {
      const note = await createKbNote(selectedKb.dir_name, targetPath, '无标题');
      await refreshPath(targetPath);
      setNewlyCreatedNoteId(note.slug);
      await selectNote(note, targetPath);
    } catch (err) {
      console.error(err);
    }
  }, [activeFolderPath, refreshPath, selectNote, selectedKb]);

  const handleCreateFolder = useCallback(async () => {
    if (!selectedKb) return;
    const targetPath = activeFolderPath;
    try {
      const name = await createKbFolder(selectedKb.dir_name, targetPath ?? '', '新文件夹');
      const newPath = makeChildPath(targetPath, name);
      await refreshPath(targetPath);
      setExpanded(prev => new Set(prev).add(newPath));
      setActiveFolderPath(newPath);
      await loadContents(selectedKb.dir_name, newPath);
    } catch (err) {
      console.error(err);
    }
  }, [activeFolderPath, loadContents, refreshPath, selectedKb]);

  const handleImportToKb = useCallback(async ({ noteIds, clipIds }: { noteIds: string[]; clipIds: string[] }) => {
    if (!selectedKb) return;
    const targetPath = activeFolderPath;
    try {
      for (const id of noteIds) {
        const source = await getNote(id);
        if (!source || source.format !== 'md') continue;
        const note = await createKbNote(selectedKb.dir_name, targetPath, source.title || '无标题');
        await updateNote(note.slug, { content_md: source.content_md });
        await deleteNote(id);
      }
      for (const id of clipIds) {
        const source = await getClip(id);
        if (!source) continue;
        const note = await createKbNote(selectedKb.dir_name, targetPath, source.title || source.site_name || '剪藏');
        const content = source.content_md || source.excerpt || source.url;
        await updateNote(note.slug, { content_md: content });
      }
      await refreshPath(targetPath);
    } catch (err) {
      console.error(err);
    }
  }, [activeFolderPath, refreshPath, selectedKb]);

  const handleAddSourceFolder = useCallback(async (url: string) => {
    if (!selectedKb) return;
    const result = await addSubscription(url);
    const targetPath = activeFolderPath;
    const folderName = result.source.title || result.source.site_url || result.source.feed_url || '订阅';
    const name = await createKbFolder(selectedKb.dir_name, targetPath ?? '', folderName);
    const newPath = makeChildPath(targetPath, name);
    await refreshPath(targetPath);
    setExpanded(prev => new Set(prev).add(newPath));
    setActiveFolderPath(newPath);
    await loadContents(selectedKb.dir_name, newPath);
  }, [activeFolderPath, loadContents, refreshPath, selectedKb]);

  const handleRenameFolder = useCallback(async (folder: KbFolderEntry) => {
    if (!selectedKb) return;
    const nextName = window.prompt('重命名文件夹', folder.name);
    if (!nextName?.trim() || nextName.trim() === folder.name) return;
    try {
      const newBase = await renameKbFolder(selectedKb.dir_name, folder.path, nextName.trim());
      const parent = parentPath(folder.path);
      const nextPath = makeChildPath(parent, newBase);
      await refreshPath(parent);
      setContentsByPath(prev => {
        const next = { ...prev };
        delete next[folder.path];
        return next;
      });
      setExpanded(prev => {
        const next = new Set(prev);
        if (next.delete(folder.path)) next.add(nextPath);
        return next;
      });
      if (activeFolderPath && isInsidePath(activeFolderPath, folder.path)) {
        const suffix = activeFolderPath.slice(folder.path.length);
        setActiveFolderPath(`${nextPath}${suffix}`);
      }
      if (selectedNote?.id.startsWith(`library/${selectedKb.dir_name}/${folder.path}/`)) {
        setSelectedNote(null);
        setSelectedNoteFolderPath(undefined);
      }
    } catch (err) {
      console.error(err);
    }
  }, [activeFolderPath, refreshPath, selectedKb, selectedNote]);

  const handleDeleteFolder = useCallback(async (folder: KbFolderEntry) => {
    if (!selectedKb) return;
    if (!window.confirm(`删除文件夹「${folder.name}」？`)) return;
    try {
      await deleteKbFolder(selectedKb.dir_name, folder.path);
      const parent = parentPath(folder.path);
      await refreshPath(parent);
      setContentsByPath(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (isInsidePath(key, folder.path)) delete next[key];
        }
        return next;
      });
      setExpanded(prev => {
        const next = new Set(prev);
        for (const key of Array.from(next)) {
          if (isInsidePath(key, folder.path)) next.delete(key);
        }
        return next;
      });
      if (activeFolderPath && isInsidePath(activeFolderPath, folder.path)) setActiveFolderPath(parent);
      if (selectedNote?.id.startsWith(`library/${selectedKb.dir_name}/${folder.path}/`)) {
        setSelectedNote(null);
        setSelectedNoteFolderPath(undefined);
      }
    } catch (err) {
      console.error(err);
    }
  }, [activeFolderPath, refreshPath, selectedKb, selectedNote]);

  const handleDeleteSelectedNote = useCallback(async (noteId?: string, folderPathOverride?: string) => {
    const id = noteId ?? selectedNote?.id;
    if (!id) return;
    try {
      await deleteNote(id);
      const folderPath = folderPathOverride ?? selectedNoteFolderPath;
      if (!selectedNote || selectedNote.id === id) {
        setSelectedNote(null);
        setSelectedNoteFolderPath(undefined);
      }
      await refreshPath(folderPath);
    } catch (err) {
      console.error(err);
    }
  }, [refreshPath, selectedNote, selectedNoteFolderPath]);

  const handleUpdateSelectedNote = useCallback((patch: { title?: string; content_md?: string }, targetNoteId?: string) => {
    const id = targetNoteId ?? selectedNote?.id;
    if (!id) return;
    updateNote(id, patch)
      .then(async newSlug => {
        setSelectedNote(prev => {
          if (!prev || prev.id !== id) return prev;
          return {
            ...prev,
            id: newSlug,
            title: patch.title ?? prev.title,
            content_md: patch.content_md ?? prev.content_md,
          };
        });
        await refreshPath(selectedNoteFolderPath);
      })
      .catch(console.error);
  }, [refreshPath, selectedNote, selectedNoteFolderPath]);

  const handleLocalContentChange = useCallback((id: string, content_md: string) => {
    setSelectedNote(prev => (prev?.id === id ? { ...prev, content_md } : prev));
  }, []);

  const treeEmpty = useMemo(() => {
    const rootContents = contentsByPath[''] ?? { folders: [], notes: [] };
    return rootContents.folders.length === 0 && rootContents.notes.length === 0;
  }, [contentsByPath]);

  const kbDialogs = (
    <>
      <KbFormDialog
        open={kbDialog !== null}
        mode={kbDialog?.mode ?? 'create'}
        initialName={kbDialog?.mode === 'edit' ? kbDialog.kb.name : ''}
        initialColor={kbDialog?.mode === 'edit' ? kbDialog.kb.color : 'blue'}
        onClose={() => setKbDialog(null)}
        onSubmit={handleSaveKb}
      />
      <ConfirmDialog
        open={kbToDelete !== null}
        title="删除知识库"
        description={kbToDelete ? `删除「${kbToDelete.name}」以及其中所有内容。` : undefined}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDeleteKb}
        onCancel={() => setKbToDelete(null)}
      />
    </>
  );

  if (!selectedKb) {
    return (
      <>
        <div className={`flex h-full flex-col overflow-hidden ${hidden ? 'w-0' : 'flex-1'}`}>
          <div className="flex h-12 shrink-0 items-center justify-between px-5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-stone-900 dark:text-stone-100">知识库</span>
              <span className="text-[13px] text-stone-400 dark:text-stone-500">全部 · {kbs.length}</span>
            </div>
            <button
              type="button"
              onClick={handleImportFolder}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-indigo-600"
            >
              <ImportIcon />
              导入知识库
            </button>
          </div>
          {loadingKbs ? (
            <div className="flex flex-1 items-center justify-center text-sm text-stone-400">加载中…</div>
          ) : (
            <LibraryList
              libraries={kbs}
              onOpen={openKb}
              onCreate={() => setKbDialog({ mode: 'create' })}
              onEdit={(kb) => setKbDialog({ mode: 'edit', kb })}
              onDelete={setKbToDelete}
            />
          )}
        </div>
        {kbDialogs}
      </>
    );
  }

  return (
    <>
    <div className={`flex h-full overflow-hidden ${hidden ? 'w-0' : 'flex-1'}`}>
      <aside className="relative flex w-[261px] shrink-0 flex-col overflow-hidden border-r border-black/[0.10] bg-white dark:border-white/[0.10] dark:bg-stone-900">
        <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white/80 px-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-stone-900/80">
          <button
            type="button"
            onClick={() => {
              setSelectedKb(null);
              setSelectedNote(null);
              setSelectedNoteFolderPath(undefined);
              setActiveFolderPath(undefined);
            }}
            className="flex items-center gap-0.5 text-[12px] font-medium text-stone-500 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            <BackIcon />
            知识库
          </button>
          <div className="min-w-0 flex-1 truncate text-[14px] font-bold text-stone-900 dark:text-stone-100">{selectedKb.name}</div>
          <div className="relative">
            <button
              type="button"
              title="导入"
              onClick={() => {
                setAddMenuOpen(false);
                setImportMenuOpen(v => !v);
              }}
              className="grid h-7 w-7 place-items-center rounded-md text-stone-500 transition-colors hover:bg-black/[0.04] hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.08] dark:hover:text-stone-100"
            >
              <ImportIcon />
            </button>
            {importMenuOpen && (
              <div className="absolute right-0 top-[calc(100%_+_6px)] z-30 w-40 overflow-hidden rounded-xl bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.06] dark:bg-stone-800 dark:ring-white/[0.08]">
                <ActionMenuItem
                  icon={<ImportIcon />}
                  label="剪藏 / 笔记"
                  onClick={() => {
                    setImportMenuOpen(false);
                    setImportDialogOpen(true);
                  }}
                />
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              title="添加"
              onClick={() => {
                setImportMenuOpen(false);
                setAddMenuOpen(v => !v);
              }}
              className="grid h-7 w-7 place-items-center rounded-md text-stone-500 transition-colors hover:bg-black/[0.04] hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.08] dark:hover:text-stone-100"
            >
              <PlusIcon />
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-[calc(100%_+_6px)] z-30 w-36 overflow-hidden rounded-xl bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.06] dark:bg-stone-800 dark:ring-white/[0.08]">
                <ActionMenuItem
                  icon={<NoteIcon />}
                  label="笔记"
                  onClick={() => {
                    setAddMenuOpen(false);
                    handleCreateNote();
                  }}
                />
                <ActionMenuItem
                  icon={<FolderIcon />}
                  label="文件夹"
                  onClick={() => {
                    setAddMenuOpen(false);
                    handleCreateFolder();
                  }}
                />
                <ActionMenuItem
                  icon={<RssIcon />}
                  label="订阅博主"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setSourceDialogOpen(true);
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto sidebar-scroll px-2 py-1.5">
          {loadingPaths.has('') && !contentsByPath[''] ? (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">加载中…</div>
          ) : treeEmpty ? (
            <div className="px-4 py-10 text-center text-[13px] text-stone-400 dark:text-stone-500">还没有内容</div>
          ) : (
            <TreeLevel
              contentsByPath={contentsByPath}
              expanded={expanded}
              activeFolderPath={activeFolderPath}
              selectedNoteSlug={selectedNoteSlug}
              loadingPaths={loadingPaths}
              onToggleFolder={toggleFolder}
              onSelectFolder={(folder) => {
                setActiveFolderPath(folder.path);
                setSelectedNote(null);
                setSelectedNoteFolderPath(undefined);
              }}
              onSelectNote={selectNote}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onDeleteNote={(note, folderPath) => handleDeleteSelectedNote(note.slug, folderPath)}
            />
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-white dark:bg-stone-900">
        {loadingNote ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-400">加载中…</div>
        ) : selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            onChange={handleUpdateSelectedNote}
            onLocalContentChange={handleLocalContentChange}
            theme={editorTheme}
            onDelete={() => handleDeleteSelectedNote()}
            onCreate={handleCreateNote}
            aiOpen={false}
            expanded={false}
            onExpand={() => undefined}
            canBack={false}
            canForward={false}
            onBack={() => undefined}
            onForward={() => undefined}
            newlyCreatedId={newlyCreatedNoteId}
            onCreateAnimDone={() => setNewlyCreatedNoteId(null)}
          />
        ) : (
          <main className="flex h-full flex-col">
            <div className="h-12 shrink-0 border-b border-black/[0.06] bg-white/80 backdrop-blur-md dark:border-white/[0.06] dark:bg-stone-900/80" />
            <div className="flex flex-1 items-center justify-center text-sm text-stone-400 dark:text-stone-500">选择一篇笔记</div>
          </main>
        )}
      </div>
    </div>
    {kbDialogs}
    <KbImportDialog
      open={importDialogOpen}
      onClose={() => setImportDialogOpen(false)}
      onSubmit={handleImportToKb}
    />
    <AddSourceDialog
      open={sourceDialogOpen}
      onClose={() => setSourceDialogOpen(false)}
      onSubmit={handleAddSourceFolder}
    />
    </>
  );
}
