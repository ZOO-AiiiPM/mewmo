import { tool } from 'ai';
import { z } from 'zod';
import type { Note, Clip } from '../../types';
import { getNote, listClips, getClip, searchAll } from '../db';

// Agent 上下文：当前打开的笔记 / 剪藏 / 当前区域。
// 用 ref-style 包装 —— execute 调用时才读取，确保拿到最新值（panel 挂载后用户切换笔记也能感知）。
export type AgentContext = {
  getCurrentNote: () => Note | null;
  getCurrentClip: () => Clip | null;
  getZone: () => string;
};

// 截断字符串到 N 字，避免单条工具结果撑爆 context。1.5w 字 ≈ ~5k token，够 LLM 摘要。
function truncate(s: string, max = 15000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n[…内容过长，已截断 ${s.length - max} 字]`;
}

function clipSummary(c: Clip) {
  return {
    id: c.id,
    title: c.title || '无标题',
    site_name: c.site_name,
    url: c.url,
    excerpt: c.excerpt?.slice(0, 120) ?? '',
    saved_at: c.saved_at,
  };
}

function stripMarks(html: string): string {
  return html.replace(/<\/?mark>/g, '');
}

export function createTools(ctx: AgentContext) {
  return {
    read_current_note: tool({
      description:
        '读取用户当前正在查看 / 编辑的笔记，返回完整标题和正文。如果当前在剪藏区或没选中笔记，返回 null。',
      inputSchema: z.object({}),
      execute: async () => {
        const n = ctx.getCurrentNote();
        if (!n) return { ok: false, reason: 'no_note_selected' };
        return {
          ok: true,
          id: n.id,
          title: n.title,
          content_md: truncate(n.content_md),
        };
      },
    }),

    read_current_clip: tool({
      description:
        '读取用户当前正在查看的剪藏（网页摘录），返回完整标题、来源、正文 markdown。如果当前不在剪藏区或没选中，返回 null。',
      inputSchema: z.object({}),
      execute: async () => {
        const c = ctx.getCurrentClip();
        if (!c) return { ok: false, reason: 'no_clip_selected' };
        return {
          ok: true,
          id: c.id,
          title: c.title,
          url: c.url,
          site_name: c.site_name,
          content_md: truncate(c.content_md),
        };
      },
    }),

    search_notes: tool({
      description:
        '在所有笔记里按关键词模糊匹配（命中标题或正文），返回最多 limit 条概要列表。用于先定位再调 read_note 读全文。',
      inputSchema: z.object({
        query: z.string().describe('要搜索的关键词，可以是中文或英文'),
        limit: z.number().int().min(1).max(20).optional().describe('最多返回几条，默认 10'),
      }),
      execute: async ({ query, limit = 10 }) => {
        const hits = (await searchAll(query)).notes;
        return {
          total: hits.length,
          results: hits.slice(0, limit).map(h => ({
            id: h.id,
            title: stripMarks(h.title_html) || '无标题',
            excerpt: stripMarks(h.snippet),
            updated_at: h.updated_at,
          })),
        };
      },
    }),

    read_note: tool({
      description: '按 id 读取一条笔记的完整内容。通常先用 search_notes 拿到 id 再调用。',
      inputSchema: z.object({
        id: z.string().describe('笔记 vault slug'),
      }),
      execute: async ({ id }) => {
        const n = await getNote(id);
        if (!n) return { ok: false, reason: 'not_found' };
        return {
          ok: true,
          id: n.id,
          title: n.title,
          content_md: truncate(n.content_md),
        };
      },
    }),

    list_clips: tool({
      description:
        '列出所有剪藏（按保存时间倒序），返回概要。可选 query 做关键词过滤（命中标题 / 摘要 / 正文）。',
      inputSchema: z.object({
        query: z.string().optional().describe('可选关键词过滤'),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ query, limit = 15 }) => {
        if (query) {
          const hits = (await searchAll(query)).clips;
          return {
            total: hits.length,
            results: hits.slice(0, limit).map(h => ({
              id: h.id,
              title: stripMarks(h.title_html) || '无标题',
              site_name: h.site_name,
              excerpt: stripMarks(h.snippet),
              saved_at: h.saved_at,
            })),
          };
        }

        const all = await listClips();
        return {
          total: all.length,
          results: all.slice(0, limit).map(clipSummary),
        };
      },
    }),

    read_clip: tool({
      description: '按 id 读取一条剪藏的完整正文。先用 list_clips 拿到 id 再调用。',
      inputSchema: z.object({
        id: z.string().describe('剪藏 vault slug'),
      }),
      execute: async ({ id }) => {
        const c = await getClip(id);
        if (!c) return { ok: false, reason: 'not_found' };
        return {
          ok: true,
          id: c.id,
          title: c.title,
          url: c.url,
          site_name: c.site_name,
          content_md: truncate(c.content_md),
        };
      },
    }),
  };
}

export type AppTools = ReturnType<typeof createTools>;
