#!/usr/bin/env node
// SessionStart 触发 —— 预读 journal 顶部 3 条注入 context，Claude 不再需要 Read 整个 journal。
// 关闭：删 .claude/settings.local.json 里的 hooks.SessionStart 段。

const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const journalPath = path.join(projectDir, 'journal.md');

function getTop3Entries(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return '（journal.md 不存在或无法读取）';
  }

  // 按 ## YYYY-MM-DD 标题分割，跳过文件头部的 # 和 > 说明块
  const sections = raw.split(/\n(?=## \d{4}-\d{2}-\d{2})/);
  const entries = sections.filter(s => /^## \d{4}-\d{2}-\d{2}/.test(s));

  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return '（journal 暂无条目）';

  // 截断超长单条（单条最多 800 字符，保持 context 可控）
  const trimmed = top3.map(entry => {
    if (entry.length > 800) return entry.slice(0, 800) + '\n…（已截断，完整内容见 journal.md）';
    return entry;
  });

  return trimmed.join('\n---\n');
}

const journalSnippet = getTop3Entries(journalPath);

const additionalContext = `【新 session — 项目状态同步】

以下是 journal.md 最新 3 条（hook 已预读，**不要再 Read journal.md**，需要更早的条目再加 offset）：

${journalSnippet}

---
MEMORY.md 已通过 autoMemoryDirectory 自动加载，无需重读。

基于以上内容，用 3-5 行告诉用户「上次做到 X / 当前焦点 Y / 今天可以接着做 Z」。
主轴用 journal 最近的线索，memory / CLAUDE.md 待做只挑和主轴相关的提一句。
如果三处都是空的（新项目）→ 不用生成 brief，直接等用户发问。`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext
  }
}));
