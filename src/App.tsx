import { useCallback, useEffect, useState } from 'react';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { listNotes, createNote, updateNote, deleteNote } from './lib/db';
import type { Note } from './types';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await listNotes();
    setNotes(list);
    return list;
  }, []);

  useEffect(() => {
    refresh()
      .then(list => {
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const id = await createNote();
    await refresh();
    setSelectedId(id);
  }, [refresh]);

  const handleUpdate = useCallback(
    async (patch: { title?: string; content_md?: string }) => {
      if (!selectedId) return;
      await updateNote(selectedId, patch);
      // 局部更新避免抖动
      setNotes(prev =>
        prev.map(n =>
          n.id === selectedId
            ? { ...n, ...patch, updated_at: Math.floor(Date.now() / 1000) }
            : n
        )
      );
    },
    [selectedId]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteNote(id);
      const list = await refresh();
      if (selectedId === id) {
        setSelectedId(list.length > 0 ? list[0].id : null);
      }
    },
    [refresh, selectedId]
  );

  const selectedNote = notes.find(n => n.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-stone-400 text-sm">
        加载中…
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-stone-50 dark:bg-stone-950">
      <NoteList
        notes={notes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <NoteEditor note={selectedNote} onChange={handleUpdate} />
    </div>
  );
}
