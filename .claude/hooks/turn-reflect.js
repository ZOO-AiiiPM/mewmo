#!/usr/bin/env node
// Stop 触发 —— 三级提醒：journal(每 JOURNAL_EVERY 轮) / 蒸馏(DISTILL_EVERY) / review(REVIEW_EVERY)
// 阈值改下方常量。关闭某一级：把对应值设为 999999。
// 完全关闭：删 .claude/settings.local.json 里的 hooks.Stop 段。

const fs   = require('fs');
const path = require('path');

const JOURNAL_EVERY = 5;
const DISTILL_EVERY = 10;
const REVIEW_EVERY  = 30;

const projectDir  = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const counterFile = path.join(projectDir, '.claude', '.turn-counter');

let count = 0;
try { count = parseInt(fs.readFileSync(counterFile, 'utf8').trim()) || 0; } catch (_) {}
count++;
try { fs.writeFileSync(counterFile, String(count)); } catch (_) {}

const hitJournal = count % JOURNAL_EVERY === 0;
const hitDistill = count % DISTILL_EVERY === 0;
const hitReview  = count % REVIEW_EVERY  === 0;

if (!hitJournal && !hitDistill && !hitReview) process.exit(0);

const parts = [];

if (hitJournal) {
  parts.push(
    `【第 ${count} 轮 — journal 提醒】\n` +
    `判断本段有没有值得记的进展 / 踩坑 / 学到：\n` +
    `- 有实质决策 / 不可逆操作 / 踩坑 → 提炼 2-3 句要点，用 Agent(run_in_background: true) 派后台 Agent 写 journal.md 顶部条目（传入：要点 + 今天日期 + journal.md 绝对路径；Agent 写完无需回复用户）；然后立即告知用户一句"📝 已派后台记录 journal"，不等 Agent 完成\n` +
    `- 只是澄清 / 讨论 / 列方案 → 静默跳过，不通知`
  );
}

if (hitDistill) {
  parts.push(
    `【第 ${count} 轮 — 蒸馏提醒】\n` +
    `回看 journal 顶部 + 最近对话，判断要不要蒸馏。蒸馏链：journal 一句话'坑了' → 重复 2+ 次或单次反转复杂 → lesson 叙事 → 规律稳定 → rules/ 命令式 → 跨项目有效 → ~/.claude/rules/ 全局。\n\n` +
    `触发信号与动作：\n` +
    `- journal 最近 7-14 天'坑了'出现重复关键词 → 升 lesson 或 rule\n` +
    `- 单次踩坑但有反转（方案 A→B→C 才成）或反直觉结论 → 升 lesson\n` +
    `- 用户明确纠正规则 2+ 次 → 抽 rule（短的 1-3 行进 CLAUDE.md 项目硬规则段，长的进 .claude/rules/{主题}.md）\n` +
    `- 写了 memory 主题文件但 MEMORY.md 没更新索引 → 立刻补\n\n` +
    `有需要蒸馏的内容 → 提炼要点，用 Agent(run_in_background: true) 派后台 Agent 写文件（传入：蒸馏内容 + 目标文件路径）；立即告知用户一句"✨ 已派后台蒸馏"，不等 Agent 完成。无需蒸馏 → 静默跳过。`
  );
}

if (hitReview) {
  parts.push(
    `【第 ${count} 轮 — 规则 review 提醒】\n` +
    `扫 CLAUDE.md + .claude/rules/，找这几类问题：\n` +
    `1. 重复规则（语义重合）→ 合并或删一处\n` +
    `2. 冲突规则（A 处必须 X，B 处 X 可选）→ 协调，否则模型随机跳训练先验\n` +
    `3. 可合并的规则（多份文件各写一条同主题）→ 按主题聚合\n` +
    `4. CLAUDE.md 里超 3 行的长规则 → 迁 .claude/rules/{主题}.md\n` +
    `5. 可升级到全局的规则（跨项目有效）→ 建议迁 ~/.claude/rules/\n` +
    `6. 过期规则（场景已不存在）→ archive\n` +
    `7. 柔化词规则（尽量 / 可能 / 建议）→ 改命令式或删\n\n` +
    `输出简短建议清单，每条带文件路径 + 行号。没发现问题汇报一句即可，不用硬凑。`
  );
}

process.stdout.write(JSON.stringify({ decision: 'block', reason: parts.join('\n\n') }));
