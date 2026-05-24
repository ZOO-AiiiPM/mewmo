import { invoke } from '@tauri-apps/api/core';
import type { Note, Clip, SearchResults } from '../types';

// 8 个原 db.ts 函数迁移：tauri-plugin-sql (sqlx) 直接 SQL → invoke Rust commands
// 接口签名保持不变 → 组件代码（listNotes() / createNote() / ...）零改动

// __TAURI_INTERNALS__ 注入有时序窗口,webview 启动到注入完成有几十毫秒间隙;
// React useEffect 可能落在这个窗口里,invoke 会同步 throw `Cannot read invoke of undefined`。
// 包装一层短延迟重试,最多覆盖 ~500ms(10 × 50ms)—— 实际通常 1-2 次就成功。
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      const msg = String(e);
      // 只对"Tauri 还没注入"类错误重试,业务错误立即抛
      if (msg.includes('undefined') || msg.includes('__TAURI')) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * 旧 tauri-plugin-sql 模式占位（订阅功能 lib/subscription.ts 还在用 d.execute()）。
 * 暂保留 stub 让 TS 编译通过；运行时调到会显式报错——订阅区需要由专门 agent
 * 把 db CRUD 迁移到 invoke commands 模式（参考 commands/notes.rs / commands/clips.rs）。
 */
async function db(): Promise<never> {
  throw new Error('legacy db() removed: subscription db CRUD pending migration to invoke commands');
}

/** 让其它 lib/*.ts（如 lib/subscription.ts）复用同一 db connection */
export const getDb = db;

export async function listNotes(): Promise<Note[]> {
  return call<Note[]>('list_notes');
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
