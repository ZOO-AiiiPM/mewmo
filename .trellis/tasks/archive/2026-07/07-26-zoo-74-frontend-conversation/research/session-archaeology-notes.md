# 考古补录（2026-07-26，源会话 a2d39f0f 等已死）

1. **基线问题**：当前分支 `codex/zoo-74-frontend-conversation` 的 WIP `afe9470`（27 文件）基于旧 main `895c3cc`，需 rebase 到 `b3cb97f`；预期与 PR #27/#32 的 agent 改动冲突（重点：agent chats API 路由、globals.css）。注意 globals.css 上还有 7/10 画框改造（`--frame`/`--selected` 体系，藏在 main 的 `8e04277` 里），冲突调和以 main 为准，见 `.trellis/workspace/zoo/session-briefs/shell-frame-css.md`。
2. **旧基线不认 google provider**：本分支 packages/ai 不接受 `AI_PROVIDER=google`（#29 才进 main）——rebase 前在本分支起 agent 会失败，属已知问题不用排查。
3. **ZOO-63 epic 诊断**：ZOO-74 代码/测试当时全绿，只差浏览器真机验收；卡点是本地环境（web 连 Neon 被 Clash TUN 掐断，候选解法：Clash 直连 `*.neon.tech` / 关 TUN / 本地 Postgres）。3101 端口有存活的 agent dev server（PID 94723，起自 zoo-63-local-ai-acceptance worktree）可复用。
4. **上游依赖**：服务端稳定事件协议（chatId/turnId/seq、断线补发）在 ZOO-70 的 WIP `246e102` 里，见任务 `07-26-zoo-70-backend-runtime`——rebase 后应对照该提交确认前端假设。
5. 根 `.env.local` 已被追加 AGENT_SERVER_URL/AGENT_INTERNAL_SECRET/AGENT_IDENTITY_SECRET（备份 `.env.local.bak-before-agent`）。
