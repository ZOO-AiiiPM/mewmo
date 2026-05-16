import Database from '@tauri-apps/plugin-sql';
import type { Note } from '../types';

let _db: Database | null = null;

async function db(): Promise<Database> {
  if (!_db) {
    _db = await Database.load('sqlite:vibe.db');
  }
  return _db;
}

export async function listNotes(): Promise<Note[]> {
  const d = await db();
  return d.select<Note[]>(
    'SELECT id, title, content_md, created_at, updated_at FROM notes ORDER BY updated_at DESC'
  );
}

export async function createNote(): Promise<number> {
  const d = await db();
  const result = await d.execute(
    "INSERT INTO notes (title, content_md) VALUES ('', '')"
  );
  return result.lastInsertId as number;
}

export async function updateNote(
  id: number,
  patch: { title?: string; content_md?: string }
): Promise<void> {
  const d = await db();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    args.push(patch.title);
  }
  if (patch.content_md !== undefined) {
    sets.push('content_md = ?');
    args.push(patch.content_md);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = unixepoch()');
  args.push(id);
  await d.execute(
    `UPDATE notes SET ${sets.join(', ')} WHERE id = ?`,
    args
  );
}

export async function deleteNote(id: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM notes WHERE id = ?', [id]);
}
