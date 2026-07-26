# 接手简报：ZOO-60 浏览器验收（已完成 AI 侧预验收，待用户终验）

会话 1（b65bde5d，2026-07-26 07:22–08:31）完成 5/7 项后额度耗尽；会话 2（2026-07-26 ~18:30 完成）接手补完剩余项 + 双主题回归 + Linear 评论。**AI 侧预验收 7/7 全绿，零新增 bug。**

Trellis 任务：`.trellis/tasks/07-26-zoo-60-browser-acceptance/`（in_progress，等用户终验后收尾）。

## 最终验收结果（全部 ✅）

| # | 验收项 | 证据要点 |
|---|---|---|
| 1 | 移动弹窗两列固定高度可滚动 | max-height 280px + overflow auto，scrollH 403>278（双主题） |
| 2 | 未选文件夹「移动」置灰 | disabled=true（双主题） |
| 3 | 无「知识库根级」选项 | DOM 无该字符串 |
| 4 | 本地导入单一入口 | 根级空状态仅「从本地导入」 |
| 5 | 笔记卡两行预览/独立省略号/等高 | 4 卡 118.84px、预览槽 38.09px（双主题同值），超长首行仅第一行省略 |
| 6 | 「原文」默认灰→hover 白+下划线 | 深：103,103,109→237,237,241+underline；浅：154,154,160→29,29,31(--ink)+underline；剪藏+知识库阅读器双处实测 |
| 7 | 剪藏元信息对应 | 阅读器头部 example.com·测试作者·2026年7月20日 17:26·原文 |
| 回归 | 导入弹窗正文预览（笔记+剪藏 tab） | 双主题；空笔记无残留；剪藏已顺带导入文件夹 01 验证闭环 |

## 重要口径修正

会话 1 简报预期「列表卡元信息 = 测试作者·example.com·07-20」**是错的**。PR #20 squash 内含提交
"revert left clip card to original domain · createdAt"（用户澄清列表卡从未批准加作者/日期）。
**最终契约：左列表卡 = favicon+域名+收藏时间；作者+发布日期只在右侧阅读器头部。** 静态测试
workspace-prototype-ui「recency time」与此一致。已在 Linear 评论中说明。

## 已交付

- Linear ZOO-60 中文验收评论（2026-07-26 10:37 UTC，评论 id `90705b0b`）+ 10 张截图附件（深 6 浅 4）。
- 截图本地留档：本 worktree `.playwright-mcp/zoo60/`（13 张，含未上传的 3 张冗余角度）。
- Issue 仍为 In Progress，等用户在生产 https://mewmo.vercel.app 终验后翻 Done。

## 环境（保留至用户终验后再清）

- `localhost:3021`：`.worktrees/main-audit/apps/web`（detached @ b3cb97f）。重启：`PORT=3021 pnpm dev`。
- Docker `mewmo-audit-pg`（宿主 5433，库 mewmo_audit）。重启：`docker start mewmo-audit-pg`。
- 账号：`audit@local.test` / `Audit-2026-zoo60`（仅本地）。
- 数据变更（验收操作产生，无害）：剪藏「测试剪藏文章」已导入 验收知识库/文件夹 01。

## 用户终验通过后的收尾清单

1. task.py 把 trellis 任务收尾。
2. kill 3021 dev server；`docker rm -f mewmo-audit-pg`；删 `.worktrees/main-audit/apps/web/.env.local`。
3. 删本 worktree `.playwright-mcp/` 截图留档（如不再需要）。

## 踩坑（沿用会话 1）

1. 别在主工作区验（基于 895c3cc 看不到修复）。
2. 别连 Neon（本机 pg TLS 被掐）；`postgres:16-alpine` 无 vector 扩展。
3. users 表密码列叫 `password`；env 硬要求 REDIS_URL、GOOGLE_CLIENT_ID/SECRET，缺则 login 500。
4. Playwright MCP 截图只能写 worktree 内（`.playwright-mcp/`），scratchpad 不在允许根内。
