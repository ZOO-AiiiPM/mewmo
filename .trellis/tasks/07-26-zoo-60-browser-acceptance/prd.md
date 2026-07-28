# ZOO-60 浏览器验收：知识库细碎问题六项预验证

## 背景

Linear ZOO-60（parent ZOO-19）的修复已通过 PR #20 合入 main（squash commit `65bc650`），Vercel Production 已部署。Issue 保持 In Progress 的唯一原因是「登录后的 UI/交互验收未完成」。本任务做 AI 侧浏览器预验收，产出证据后交用户做最终验收。

## 代码审计结论（2026-07-26，对照 origin/main）

| 项 | 代码状态 | 证据 |
|---|---|---|
| 移动弹窗列表固定高度可滚动 | 已实现 | globals.css:5685 `.mewmo-move-knowledge__list` max-height 280px + overflow-y auto |
| 未选文件夹时「移动」置灰 | 已实现 | MoveToKnowledgeProvider.tsx:240 `selectedFolderId !== null` 进 canSubmit |
| 删除「知识库根级」选项 | 已实现 | origin/main 全仓无该字符串 |
| 合并为单一「从本地导入」 | 已实现 | knowledge-bases/page.tsx:801/825、Sidebar.tsx:917/1360 均为「从本地导入」，无文件/文件夹双入口残留 |
| 笔记预览两行独立省略号+固定槽位 | 已实现 | globals.css `.mewmo-list-card__preview--note` grid 2×1.5em + per-line ellipsis；note-list-preview.ts previewLines |
| 「原文」灰→hover 白+下划线 | 已实现 | globals.css:3109-3118 |

## 验收清单（浏览器，登录态）

1. 移动到知识库弹窗：知识库/文件夹两列固定高度、内容多时可滚动
2. 未选中文件夹时「移动」按钮置灰不可点；选中后可用
3. 文件夹列表中无「知识库根级」选项
4. 空状态与侧边栏 +/更多菜单：只有「从本地导入」单一入口
5. 笔记列表卡片预览：两行、每行独立省略号、空笔记与有预览卡片槽位等高
6. 知识库/剪藏/订阅阅读器「原文」链接：默认灰色，hover 白色+下划线
7. 顺带回归 PR#20 早期项：列表卡元信息（作者·来源·日期）、导入弹窗笔记正文预览

浅色/深色两种主题都要过一遍（项目验证标准）。

## 环境约束

- 本地 HEAD（codex/zoo-74-frontend-conversation 分支）不含 PR #20，起 localhost 看不到修复。
- 验证走生产 https://mewmo.vercel.app，或从 origin/main 建独立 worktree 起 localhost（不动 ZOO-74 已暂存改动）。
- 需要登录账号；无现成账号时向用户要，或按既有惯例建临时账号并事后清理。

## 完成标准（Acceptance Criteria）

- [ ] 六项 + 回归项在浏览器逐条核验，双主题记录证据
- [ ] 在 ZOO-60 下用中文评论验收结果；Issue 状态仍由用户最终验收后才翻 Done
- [ ] 不修改任何业务代码（纯验收任务；发现新 bug 记录反馈，不擅自扩 scope 修复）
