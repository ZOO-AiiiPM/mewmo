import Database from '@tauri-apps/plugin-sql';
import type { Note, Clip } from '../types';

let _db: Database | null = null;

async function db(): Promise<Database> {
  if (_db) return _db;
  // Tauri 注入 __TAURI_INTERNALS__ 有时序窗口：webview 启动到注入完成有几十毫秒间隙，
  // React useEffect 可能落在这个窗口里。Database.load 内部调 invoke 会同步 throw。
  // 失败就短延迟重试，最多覆盖 ~500ms — 实际通常 1-2 次就成功。
  let lastErr: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      _db = await Database.load('sqlite:vibe.db');
      return _db;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 50));
    }
  }
  throw lastErr;
}

/** 让其它 lib/*.ts（如 lib/subscription.ts）复用同一 db connection */
export const getDb = db;

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

// ── 剪藏 ──────────────────────────────────────────────────────────────────

export async function listClips(): Promise<Clip[]> {
  const d = await db();
  return d.select<Clip[]>(
    'SELECT id, url, title, content_md, excerpt, site_name, favicon_url, saved_at, cover_image, author, published_at FROM clips ORDER BY saved_at DESC'
  );
}

export async function saveClip(
  clip: Omit<Clip, 'id' | 'saved_at'>
): Promise<number> {
  const d = await db();
  const result = await d.execute(
    'INSERT INTO clips (url, title, content_md, excerpt, site_name, favicon_url, cover_image, author, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [clip.url, clip.title, clip.content_md, clip.excerpt, clip.site_name, clip.favicon_url,
     clip.cover_image, clip.author, clip.published_at]
  );
  return result.lastInsertId as number;
}

export async function deleteClip(id: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM clips WHERE id = ?', [id]);
}

export async function updateClip(
  id: number,
  patch: Omit<Clip, 'id' | 'saved_at'>
): Promise<void> {
  const d = await db();
  await d.execute(
    `UPDATE clips SET url=?, title=?, content_md=?, excerpt=?, site_name=?,
                      favicon_url=?, cover_image=?, author=?, published_at=?
     WHERE id=?`,
    [patch.url, patch.title, patch.content_md, patch.excerpt, patch.site_name,
     patch.favicon_url, patch.cover_image, patch.author, patch.published_at, id]
  );
}
