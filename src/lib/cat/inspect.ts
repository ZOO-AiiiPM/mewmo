/**
 * Cat 主动行为：查看当前打开的内容 / 扫一眼 vault
 *
 * 与 dailyReport.ts 同一类（手动触发 + 单次 LLM + 返回文本，不写 vault），
 * 但**只返回文本不持久化**（caller 决定显示在 toast / inline / 等）。
 *
 * 不做：错误重试 / Skill 集成 / 自动化。
 */

import { askCat, type CatResponse } from './agent';
import { listVault } from '../vault';
import type { Note, Clip } from '../../types';

const VAULT_LIST_LIMIT = 30;
const NOTE_BODY_LIMIT = 6000;
const CLIP_BODY_LIMIT = 6000;

/** 让猫看一眼当前打开的笔记或剪藏 */
export async function inspectCurrent(opts: {
  note?: Note | null;
  clip?: Clip | null;
}): Promise<CatResponse> {
  const { note, clip } = opts;

  if (!note && !clip) {
    throw new Error('当前没打开笔记或剪藏，让我看啥呢？');
  }

  const parts: string[] = [];
  if (note) {
    parts.push(`# 当前打开的笔记`);
    parts.push(`标题：${note.title || '无标题'}`);
    if (note.tags_text) parts.push(`标签：${note.tags_text}`);
    const body = (note.content_md || '').slice(0, NOTE_BODY_LIMIT);
    parts.push(`正文：\n${body}`);
    if ((note.content_md || '').length > NOTE_BODY_LIMIT) {
      parts.push(`（正文过长已截断 ${(note.content_md || '').length - NOTE_BODY_LIMIT} 字）`);
    }
  }
  if (clip) {
    parts.push(`# 当前打开的剪藏`);
    parts.push(`标题：${clip.title || '无标题'}`);
    if (clip.site_name) parts.push(`来源：${clip.site_name}`);
    if (clip.url) parts.push(`URL：${clip.url}`);
    if (clip.excerpt) parts.push(`摘要：${clip.excerpt}`);
    const body = (clip.content_md || '').slice(0, CLIP_BODY_LIMIT);
    parts.push(`正文：\n${body}`);
    if ((clip.content_md || '').length > CLIP_BODY_LIMIT) {
      parts.push(`（正文过长已截断 ${(clip.content_md || '').length - CLIP_BODY_LIMIT} 字）`);
    }
  }

  return await askCat({
    scenario: 'inspect-current',
    context: parts.join('\n\n'),
    maxLength: 400,
  });
}

/** 让猫扫一眼 vault 当前内容（最近 wiki/notes/ + raw/clips/） */
export async function inspectVault(): Promise<CatResponse> {
  const parts: string[] = ['# vault 当前内容快览'];

  try {
    const notes = await listVault('wiki/notes', false);
    if (notes.length > 0) {
      const sorted = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, VAULT_LIST_LIMIT);
      parts.push(`## wiki/notes/（按 mtime 倒序 ${sorted.length} 条）`);
      for (const n of sorted) {
        const title = n.title || n.relative_path;
        const tags = n.tags.length > 0 ? ` [${n.tags.join(', ')}]` : '';
        parts.push(`- ${title}${tags}`);
      }
    }
  } catch (e) {
    console.warn('[cat] inspectVault list wiki/notes failed:', e);
  }

  try {
    const clips = await listVault('raw/clips', false);
    if (clips.length > 0) {
      const sorted = [...clips].sort((a, b) => b.mtime - a.mtime).slice(0, VAULT_LIST_LIMIT);
      parts.push(`## raw/clips/（按 mtime 倒序 ${sorted.length} 条）`);
      for (const c of sorted) {
        parts.push(`- ${c.title || c.relative_path}`);
      }
    }
  } catch (e) {
    console.warn('[cat] inspectVault list raw/clips failed:', e);
  }

  if (parts.length === 1) {
    parts.push('（vault 还很空——还没什么可看的。）');
  }

  return await askCat({
    scenario: 'inspect-vault',
    context: parts.join('\n'),
    maxLength: 400,
  });
}
