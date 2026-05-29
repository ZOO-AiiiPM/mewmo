import type { Note, Clip, SearchResults } from '../types';
import { call } from './tauriCall';

// DB access is routed through Tauri invoke commands; Rust owns vault markdown CRUD.
// 接口签名保持不变 → 组件代码（listNotes() / createNote() / ...）零改动。
// spec 003-notes-clips-to-vault: id 类型从 number → string（vault slug），其余不变。

export async function listNotes(): Promise<Note[]> {
  return call<Note[]>('list_notes');
}

export async function getNote(id: string): Promise<Note | null> {
  return call<Note | null>('get_note', { id });
}

export async function createNote(): Promise<string> {
  return call<string>('create_note');
}

export async function updateNote(
  id: string,
  patch: { title?: string; content_md?: string }
): Promise<void> {
  return call<void>('update_note', { id, patch });
}

export async function deleteNote(id: string): Promise<void> {
  return call<void>('delete_note', { id });
}

// ── 剪藏 ──────────────────────────────────────────────────────────────────

export async function listClips(): Promise<Clip[]> {
  return call<Clip[]>('list_clips');
}

export async function getClip(id: string): Promise<Clip | null> {
  return call<Clip | null>('get_clip', { id });
}

export async function saveClip(
  clip: Omit<Clip, 'id' | 'saved_at' | 'tags_text'>
): Promise<string> {
  return call<string>('save_clip', { clip });
}

export async function deleteClip(id: string): Promise<void> {
  return call<void>('delete_clip', { id });
}

export async function updateClip(
  id: string,
  patch: Omit<Clip, 'id' | 'saved_at' | 'tags_text'>
): Promise<void> {
  return call<void>('update_clip', { id, patch });
}

// ── 搜索 ──────────────────────────────────────────────────────────────────

export async function searchAll(query: string): Promise<SearchResults> {
  return call<SearchResults>('search_all', { query });
}
