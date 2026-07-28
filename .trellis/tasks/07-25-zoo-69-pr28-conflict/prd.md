# 接手并解决 PR #28 合并冲突

## Goal

让 GitHub PR #28 可合并且通过真实端到端验收，在处理冲突时同时保留国际化改造和 `main` 已合入的产品行为；发现缺陷后持续修复和回归，直到已确认范围内没有已知问题。

## Background

- PR #28 `qoder/workspace` 面向 Linear ZOO-69，引入 `next-intl`、中英文消息、语言切换及部分 Web 页面国际化。
- PR 分支与 `origin/main` 的共同祖先是 `bf7fd959de91fcc6e664977b0d3d5a50ea427653`。
- Git 三方合并确认只有 `apps/web/src/components/shell/Sidebar.tsx` 存在内容冲突；其余 PR 文件可自动合并。
- `main` 在冲突文件中新增了真实的 NextAuth 登出流程、登出确认弹窗和失败提示；PR 同时把 Sidebar 固定文案迁移为翻译 key。
- Linear ZOO-69 的完整验收范围大于 PR 当前文件清单，包含笔记、剪藏、订阅、知识库、Today、聊天、回收站和忘记密码等页面；PR 描述与实际文件清单只覆盖其中一部分。

## Requirements

- 将最新 `origin/main` 合并到 PR 分支，不改写或覆盖用户在主工作区的未提交文件。
- 对 Sidebar 做语义合并：保留 `main` 的 `signOut`、pending 状态、确认弹窗与错误处理，同时将新增登出文案纳入中英文消息。
- 不在冲突解决中回退 PR 已完成的翻译接入，也不回退 `main` 自共同祖先后的其他改动。
- 检查合并结果是否存在冲突标记、缺失消息 key、类型/构建错误或相关行为测试回归。
- 将冲突解决提交并推送到 PR #28 的现有 head 分支，使 GitHub 重新计算 mergeability 和检查。
- 在独立本地环境完成中英文国际化端到端验收，覆盖首次访问、语言切换与持久化、营销页、认证页、设置页、Sidebar、登出确认及深浅主题。
- 每发现一个缺陷，先同步现象与影响，再修复、执行针对性回归和完整质量闸门，最后推送并等待 GitHub CI 与 Vercel。

## Acceptance Criteria

- [x] `qoder/workspace` 包含最新 `origin/main`，工作区不存在未解决冲突。
- [x] Sidebar 的登出按钮使用当前语言显示，点击后仍打开确认弹窗；取消、提交中状态、成功跳转登录页、失败提示均保留。
- [x] 中英文消息文件都包含本次合并所需的登出确认、进行中与失败文案，且 key 对称。
- [x] 运行与改动相关的静态检查/测试，并记录实际结果；完整 `pnpm verify` 已通过。
- [x] 冲突解决提交已推送到 `origin/qoder/workspace`，GitHub PR #28 状态为 `MERGEABLE / CLEAN`。
- [ ] 本地端到端验收覆盖中文与英文、刷新持久化、首次访问语言检测、关键页面、登出确认以及深浅主题。
- [ ] 端到端发现的问题全部修复，针对性回归与 `pnpm verify` 通过，最新提交已推送且 GitHub CI/Vercel 均通过。

## Out of Scope

- 未经确认，不借冲突修复扩展到 Linear ZOO-69 尚未覆盖的全部页面国际化。
- 不新增数据库 `users.locale` 字段，不改变现有 cookie 持久化方案。
- 不重新设计 URL locale 前缀、SEO `hreflang` 或第三语言支持。

## Key Decision

- 用户已批准本次只完成 PR #28 的冲突修复并恢复可合并；ZOO-69 尚未覆盖的页面国际化留作独立后续。

## Technical Notes

- 该任务按“仅解决冲突”时属于轻量维护，PRD-only 即可。
- 使用现有 PR worktree `/Users/zoo/zoo/CC工作目录/进行中/mewmo/.worktrees/qoder-workspace`，避免触碰主工作区的未提交协作层和部署文件。
- “直到完美”按可验证边界解释为：上述验收范围内无已知功能、可读性或持久化缺陷；不声称证明不存在任何未知缺陷。
