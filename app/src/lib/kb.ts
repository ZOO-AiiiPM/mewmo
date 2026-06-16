import { call } from './tauriCall';
import type { KnowledgeBase, KbContents } from '../types';

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
  color?: string,
  description?: string
): Promise<void> {
  return call<void>('kb_update_meta', { dirName, color, description });
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
): Promise<string> {
  return call<string>('kb_create_note', { dirName, relativePath, title });
}
