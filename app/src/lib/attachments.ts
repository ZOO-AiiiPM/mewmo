import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';

const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'];

let cachedAppDataDir: string | null = null;

async function getAppDataDir(): Promise<string> {
  if (cachedAppDataDir) return cachedAppDataDir;
  cachedAppDataDir = await invoke<string>('get_app_data_dir');
  return cachedAppDataDir;
}

function pickExt(file: File | Blob, fallbackName?: string): string {
  const name = (file as File).name || fallbackName || '';
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (ALLOWED_EXT.includes(fromName)) return fromName;
  const fromMime = (file.type || '').split('/').pop()?.toLowerCase() ?? '';
  if (ALLOWED_EXT.includes(fromMime)) return fromMime;
  return 'png';
}

/** 上传图片：File/Blob → 写入 app_data_dir/attachments → 返回相对路径 "attachments/xxx.ext" */
export async function uploadImage(file: File | Blob, fallbackName?: string): Promise<string> {
  const ext = pickExt(file, fallbackName);
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return await invoke<string>('save_attachment', { ext, bytes });
}

/** 笔记里的相对路径 → webview 能加载的 asset URL */
export async function resolveAttachmentUrl(relPath: string): Promise<string> {
  // 已经是 url（http/https/blob/data）就直接返回
  if (/^(https?:|data:|blob:|asset:)/.test(relPath)) return relPath;
  const dir = await getAppDataDir();
  const abs = await join(dir, relPath);
  return convertFileSrc(abs);
}

export function isImageFile(file: File | Blob): boolean {
  return file.type.startsWith('image/');
}

// 匹配 markdown 里的相对路径引用：attachments/xxx.ext（含中文/字母/数字/-/_/.）
const ATTACHMENT_REF_RE = /attachments\/[A-Za-z0-9._-]+/g;

/** 从一组笔记 markdown 里提所有被引用的相对路径 */
export function extractAttachmentRefs(contents: string[]): string[] {
  const set = new Set<string>();
  for (const text of contents) {
    const matches = text.match(ATTACHMENT_REF_RE);
    if (matches) matches.forEach(m => set.add(m));
  }
  return Array.from(set);
}

/** 清理孤儿附件：传入「所有被引用的相对路径」，后端删除其余文件（60s 内修改的跳过） */
export async function cleanupOrphans(referenced: string[]): Promise<number> {
  return await invoke<number>('cleanup_orphan_attachments', { referenced });
}
