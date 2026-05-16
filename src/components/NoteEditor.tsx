import { useEffect, useRef, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import type { Note } from '../types';

type Props = {
  note: Note | null;
  onChange: (patch: { title?: string; content_md?: string }) => void;
};

export function NoteEditor({ note, onChange }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const debounceRef = useRef<number | null>(null);
  const lastNoteIdRef = useRef<number | null>(null);

  // 切换笔记时同步本地状态
  useEffect(() => {
    if (note?.id !== lastNoteIdRef.current) {
      setTitle(note?.title ?? '');
      setContent(note?.content_md ?? '');
      lastNoteIdRef.current = note?.id ?? null;
    }
  }, [note]);

  // 防抖保存（1s）
  useEffect(() => {
    if (!note) return;
    if (title === note.title && content === note.content_md) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const patch: { title?: string; content_md?: string } = {};
      if (title !== note.title) patch.title = title;
      if (content !== note.content_md) patch.content_md = content;
      if (Object.keys(patch).length > 0) onChange(patch);
    }, 1000);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [title, content, note, onChange]);

  if (!note) {
    return (
      <main className="flex-1 flex items-center justify-center text-stone-400 text-sm">
        从左侧选一条笔记，或新建一条 ✨
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-white dark:bg-stone-900 overflow-hidden">
      <div className="px-6 pt-6 pb-2 border-b border-stone-100 dark:border-stone-800">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="无标题"
          className="w-full text-2xl font-semibold bg-transparent outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:placeholder:text-stone-700"
        />
      </div>
      <div className="flex-1 overflow-y-auto" data-color-mode="auto">
        <MDEditor
          value={content}
          onChange={(v) => setContent(v ?? '')}
          height="100%"
          preview="live"
          visibleDragbar={false}
          style={{ background: 'transparent', border: 'none' }}
        />
      </div>
    </main>
  );
}
