import { call } from './tauriCall';
import { open } from '@tauri-apps/plugin-dialog';
import type { Clip, KnowledgeBase, KbContents, KbNoteEntry } from '../types';

export async function listKbs(): Promise<KnowledgeBase[]> {
  return call<KnowledgeBase[]>('kb_list');
}

export async function createKb(name: string, color?: string): Promise<KnowledgeBase> {
  return call<KnowledgeBase>('kb_create', { name, color });
}

export async function deleteKb(dirName: string): Promise<void> {
  return call<void>('kb_delete', { dirName });
}

export async function updateKbMeta(
  dirName: string,
  patch: { name?: string; color?: string; description?: string; position?: number }
): Promise<void> {
  return call<void>('kb_update_meta', { dirName, ...patch });
}

export async function createKbFolder(
  dirName: string,
  relativePath: string,
  folderName: string
): Promise<string> {
  return call<string>('kb_folder_create', { dirName, relativePath, folderName });
}

export async function renameKbFolder(
  dirName: string,
  relativePath: string,
  newName: string
): Promise<string> {
  return call<string>('kb_folder_rename', { dirName, relativePath, newName });
}

export async function deleteKbFolder(dirName: string, relativePath: string): Promise<void> {
  return call<void>('kb_folder_delete', { dirName, relativePath });
}

export async function listKbContents(dirName: string, relativePath?: string): Promise<KbContents> {
  return call<KbContents>('kb_list_contents', { dirName, relativePath });
}

export async function createKbNote(
  dirName: string,
  relativePath: string | undefined,
  title: string
): Promise<KbNoteEntry> {
  return call<KbNoteEntry>('kb_create_note', { dirName, relativePath, title });
}

export async function createKbClip(
  dirName: string,
  relativePath: string | undefined,
  clip: Clip
): Promise<KbNoteEntry> {
  return call<KbNoteEntry>('kb_create_clip', { dirName, relativePath, clip });
}

export async function getKbClip(slug: string): Promise<Clip | null> {
  return call<Clip | null>('kb_get_clip', { slug });
}

export type ImportFolderStats = {
  kb_dir_name: string;
  notes_count: number;
  attachments_count: number;
  errors: string[];
};

export async function importKbFolder(): Promise<ImportFolderStats | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择要导入的文件夹',
  });
  if (!selected) return null;

  return call<ImportFolderStats>('kb_import_folder', {
    sourcePath: selected,
  });
}
