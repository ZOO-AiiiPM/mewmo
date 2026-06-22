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
): Promise<string> {
  return call<string>('update_note', { id, patch });
}

export async function deleteNote(id: string): Promise<void> {
  return call<void>('delete_note', { id });
}

export async function pinNote(id: string, pinned: boolean): Promise<void> {
  return call<void>('pin_note', { id, pinned });
}

// ── HTML 笔记导入 ─────────────────────────────────────────────────────────

export type HtmlFileInput = {
  /** 文件名（含 .html）—— title 解析失败时 fallback */
  filename: string;
  /** HTML 全文 */
  content: string;
};

export type ImportHtmlResult = {
  /** 成功时是 vault slug；失败时为 null */
  slug: string | null;
  /** 来源文件名 */
  source_name: string;
  /** 失败原因；成功时为 null */
  error: string | null;
};

/** 导入单个 HTML 文件 → 返回新笔记 slug。失败抛 String。 */
export async function importHtmlNote(filename: string, content: string): Promise<string> {
  return call<string>('import_html_note', { filename, content });
}

/** 批量导入多个 HTML 文件。返回每个文件的导入结果（含失败条目）。 */
export async function importHtmlDir(files: HtmlFileInput[]): Promise<ImportHtmlResult[]> {
  return call<ImportHtmlResult[]>('import_html_dir', { files });
}

/** 通过绝对路径批量导入（每行一条，可混合文件 + 目录；目录会递归扫 .html / .htm）。 */
export async function importHtmlPaths(paths: string[]): Promise<ImportHtmlResult[]> {
  return call<ImportHtmlResult[]>('import_html_paths', { paths });
}

// ── 剪藏 ──────────────────────────────────────────────────────────────────

export async function listClips(): Promise<Clip[]> {
  return call<Clip[]>('list_clips');
}

export async function getClip(id: string): Promise<Clip | null> {
  return call<Clip | null>('get_clip', { id });
}

export async function saveClip(
  clip: Omit<Clip, 'id' | 'saved_at' | 'tags_text' | 'content_loaded'>
): Promise<string> {
  return call<string>('save_clip', { clip });
}

export async function deleteClip(id: string): Promise<void> {
  return call<void>('delete_clip', { id });
}

export async function updateClip(
  id: string,
  patch: Omit<Clip, 'id' | 'saved_at' | 'tags_text' | 'content_loaded'>
): Promise<string> {
  return call<string>('update_clip', { id, patch });
}

export async function migrateClipsToHtml(): Promise<{ success: number; failed: number; errors: string[] }> {
  return call('migrate_clips_to_html', {});
}

// ── Vault ─────────────────────────────────────────────────────────────────

export type VaultConfig = {
  vault_path: string;
  schema_version: number;
  initialized_at: string;
  active_persona: string;
};

export async function getVaultConfig(): Promise<VaultConfig | null> {
  return call<VaultConfig | null>('vault_get_config');
}

// ── 搜索 ──────────────────────────────────────────────────────────────────

export async function searchAll(query: string): Promise<SearchResults> {
  return call<SearchResults>('search_all', { query });
}
