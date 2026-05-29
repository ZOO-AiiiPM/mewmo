/**
 * Cat 主动行为：写日报
 *
 * 流程（手动触发）：
 * 1. 收集今日 vault 上下文（log.md 末尾几条 + 最近 wiki/notes/ 列表）
 * 2. 调 askCat（scenario: 'daily-report'）让猫生成
 * 3. 原子写到 wiki/reports/daily/<YYYY-MM-DD>.md（带 cat-diary 风格 frontmatter）
 *
 * 不做：错误重试 / Skill 集成 / 定时自动跑（按用户指示「不做错误处理 / Skill / 自动化」）
 */

import { askCat } from './agent';
import { listVault, readVault, writeVault } from '../vault';

const RECENT_LOG_LINES = 30;
const RECENT_NOTES_LIMIT = 20;

/** 写一篇今日日报，返回新文件相对 vault 路径 */
export async function writeDailyReport(): Promise<string> {
  const today = todayIsoDate();
  const reportPath = `wiki/reports/daily/${today}.md`;

  // 1. 收集今日 vault 上下文
  const context = await collectTodayContext(today);

  // 2. 让猫写
  const cat = await askCat({
    scenario: 'daily-report',
    context,
    maxLength: 800,
  });

  // 3. 组装 frontmatter + 正文写入
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const frontmatter = [
    'type: report',
    `created: ${now}`,
    `updated: ${now}`,
    'author: cat',
    `tags: [daily-report, ${cat.personaId}]`,
  ].join('\n');

  const body = `# ${today} 猫的日报\n\n${cat.text.trim()}\n\n<!-- persona: ${cat.personaId} (${cat.personaName}) -->\n`;
  const fullContent = `---\n${frontmatter}\n---\n\n${body}`;

  await writeVault(reportPath, fullContent);
  return reportPath;
}

/** 收集今日 vault 活动当 LLM context */
async function collectTodayContext(today: string): Promise<string> {
  const parts: string[] = [`今天日期：${today}`];

  // log.md 末尾几条
  try {
    const log = await readVault('wiki/log.md');
    const lines = log.body.split('\n').filter((l) => l.trim());
    const recent = lines.slice(-RECENT_LOG_LINES).join('\n');
    if (recent) {
      parts.push(`# vault 最近活动日志（log.md 末尾 ${RECENT_LOG_LINES} 行）\n${recent}`);
    }
  } catch (e) {
    console.warn('[cat] read log.md failed (skipped):', e);
  }

  // 最近 wiki/notes/ 摘要
  try {
    const notes = await listVault('wiki/notes', false);
    if (notes.length > 0) {
      // 按 mtime 倒序
      const sorted = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, RECENT_NOTES_LIMIT);
      const lines = sorted.map((n) => {
        const title = n.title || n.relative_path;
        const tags = n.tags.length > 0 ? ` [${n.tags.join(', ')}]` : '';
        return `- ${title}${tags}`;
      });
      parts.push(`# 最近笔记（wiki/notes/ 按 mtime 倒序 ${RECENT_NOTES_LIMIT} 条）\n${lines.join('\n')}`);
    }
  } catch (e) {
    console.warn('[cat] list wiki/notes failed (skipped):', e);
  }

  if (parts.length === 1) {
    parts.push('（vault 还很安静，今天没什么动静——你可以让我看看你最近在想什么。）');
  }

  return parts.join('\n\n');
}

/** YYYY-MM-DD（用户本地日期） */
function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
