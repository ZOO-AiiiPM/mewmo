#!/usr/bin/env node
// SessionStart 触发 —— 新 session 开始时同步项目状态，让用户无需手动交代上下文。
// 关闭：删 .claude/settings.local.json 里的 hooks.SessionStart 段。

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "【新 session — 项目状态同步】\n读这三处，用 3-5 行告诉用户「上次做到 X / 当前焦点 Y / 今天可以接着做 Z」：\n1. journal.md 顶部 3 条（最近进展 / 踩坑 / 决策）\n2. .claude/memory/MEMORY.md（当前项目事实索引）\n3. CLAUDE.md 的「待做」段（未完成的 todo）\n\n不要把读到的内容全部复述 —— 用用户最近在做的线索（journal 顶部）作为主轴，memory / todo 只挑和这条主轴相关的提一句。如果三处都是空的（新项目）→ 不用生成 brief，直接等用户发问。"
  }
}));
