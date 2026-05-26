import type { Note, Clip, SearchResults } from '../types';
import { call } from './tauriCall';

// DB access is routed through Tauri invoke commands; Rust owns SQLite CRUD.
// 接口签名保持不变 → 组件代码（listNotes() / createNote() / ...）零改动。
// __TAURI_INTERNALS__ 注入时序窗口的 retry 由 tauriCall.ts 的 call<T> 统一处理。

export async function listNotes(): Promise<Note[]> {
  return call<Note[]>('list_notes');
}

export async function getNote(id: number): Promise<Note | null> {
  return call<Note | null>('get_note', { id });
}

export async function createNote(): Promise<number> {
  return call<number>('create_note');
}

export async function updateNote(
  id: number,
  patch: { title?: string; content_md?: string }
): Promise<void> {
  return call<void>('update_note', { id, patch });
}

export async function deleteNote(id: number): Promise<void> {
  return call<void>('delete_note', { id });
}

// ── 剪藏 ──────────────────────────────────────────────────────────────────

export async function listClips(): Promise<Clip[]> {
  return call<Clip[]>('list_clips');
}

export async function getClip(id: number): Promise<Clip | null> {
  return call<Clip | null>('get_clip', { id });
}

export async function saveClip(
  clip: Omit<Clip, 'id' | 'saved_at' | 'tags_text'>
): Promise<number> {
  return call<number>('save_clip', { clip });
}

export async function deleteClip(id: number): Promise<void> {
  return call<void>('delete_clip', { id });
}

export async function updateClip(
  id: number,
  patch: Omit<Clip, 'id' | 'saved_at' | 'tags_text'>
): Promise<void> {
  return call<void>('update_clip', { id, patch });
}

// ── 搜索 ──────────────────────────────────────────────────────────────────

export async function searchAll(query: string): Promise<SearchResults> {
  return call<SearchResults>('search_all', { query });
}
