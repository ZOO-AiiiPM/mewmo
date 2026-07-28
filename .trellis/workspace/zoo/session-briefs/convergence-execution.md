# 接手简报：分支收敛执行（会话 a2d39f0f，2026-07-26 14:58–17:04，API 故障连环中断）

## 授权状态

用户在该会话 AskUserQuestion 选择了「**全部执行（推荐档）**：commit 落袋 + 删 10 个冗余分支 + 历史遗留打 tag 后删 + prune tmp worktree」；对「是否有其他 AI 会话在 worktree 里干活」答「不确定」。会话死于执行前置安全检查第一步。四个 WIP 提交（afe9470/d205a47/246e102/61dcbde）是它死后 ~2 分钟由后继会话/用户补的。⚠️ 授权发生在已死会话，执行破坏性步骤（删分支/删文件）前建议向用户重新确认一次。

## 未完成清单

1. **前置安全检查（一步都没做）**：① `ps` 查 codex/qoder 进程存活 + 脏 worktree 近 30 分钟改动；② 审查 `.gitignore` diff；③ **扫描未跟踪的 `deploy/vercel-env-update.sh` 是否含硬编码密钥（入库前必须查）**。
2. **落袋残余**：`worktree/agent-summary-sidebar` 28 个脏文件（07-06 老 WIP）；主 worktree 未跟踪文件处置（`.agents/`、`.trellis/`、`AGENTS.md`、`agent.md`、env 备份、deploy 两个文件）；`.worktrees/qoder-workspace` 1 个琐碎改动。
3. **删冗余分支（0 个已删）**。已用 `git merge-tree` 验证并入 main 后无差异：`codex/zoo-60-misc`、`codex/zoo-62-migration-history`、`codex/zoo-64-pgvector-hybrid-retrieval`、`codex/zoo-65-jina-web-tools`、`codex/zoo-63-production-release-acceptance`、`codex/zoo-63-google-env-hotfix`、`codex/zoo-63-local-ai-acceptance`、`codex/langfuse-tracing`、`qoder-no-cn`。⚠️ 该验证早于 WIP 提交：`codex/workspace` 现在带 feed 修复 `d205a47`，**已不再是可安全删**；`codex/zoo-63-production-release-acceptance` 的 worktree 也仍有 8 个脏文件待挑拣。多数分支被 worktree 占用，删前先 `git worktree remove`。
4. **遗留分支打 tag 后删（未做）**：有真实未合并内容的 `codex/video-frontend`（+2507）、`codex/agent-summary-sidebar`（+736）、`feature/ios`（+1384）、`integration/ai-retrieval-tools` 与 `codex/zoo-60-ai-runtime-deployment`（互差 87 文件，需甄别是否只是旧版本）。
5. **`git worktree prune`（未做）**：3 个 /private/tmp prunable 条目。

## 环境与进程（简报时状态）

- **PID 94723**：`127.0.0.1:3101` agent dev server 仍在跑（tsx watch，起自 `.worktrees/zoo-63-local-ai-acceptance`），健康可复用；不用则 kill 整条链（pnpm 94694/94662、zsh 94658）。
- PID 12558：`.worktrees/main-audit` 的 next dev —— 这是 ZOO-60 验收环境的 3021 服务，**别当僵尸清掉**。
- 根 `.env.local` 已被追加 `AGENT_SERVER_URL/AGENT_INTERNAL_SECRET/AGENT_IDENTITY_SECRET`（备份 `.env.local.bak-before-agent`）；`.worktrees/zoo-63-local-ai-acceptance` 有两个软链接指向主仓 `.env.local`。
- 日志残留：`/private/tmp/mewmo-{agent,web,audit}-dev.log`。

## 关键认知（git 里看不到）

- 本地跑 agent：`apps/agent` 是 Fastify 服务（127.0.0.1:3101，Pi agent-core 0.81）；web 用 `AGENT_SERVER_URL`+`AGENT_INTERNAL_SECRET` 连它；`AGENT_IDENTITY_SECRET` ≥32 字符。**ZOO-74 分支（基于 895c3cc）的 packages/ai 不认 `AI_PROVIDER=google`**（#29 才进 main）→ 在新 main worktree 跑或先 rebase。
- web 连不上 Neon 的根因方向：Clash Verge TUN（utun6，fake-ip DNS 把 Neon 解析成 172.29.0.21）+ 系统代理 7897；TCP/SOCKS 通、pg TLS 断。候选解法：Clash 直连规则放行 `*.neon.tech` / 关 TUN / 本地 Postgres。
- ZOO-63 epic 诊断：**最大瓶颈是 ZOO-70**（被 ZOO-74/73 双重依赖，`246e102` 即其工作现场：session-storage、runtime、migration `20260725070000_fix_default_agent_sessions`）；ZOO-73 未启动形成收口真空；ZOO-74 代码/测试全绿只差浏览器真机验收；**ZOO-61 需用户重新生成 Langfuse key（旧 key 曾在对话中暴露，禁止复用）**；ZOO-69/PR#28 MERGEABLE/CLEAN 但停滞。
- 节奏病：main 已 2 天无新 merge；出现过两轮「多 agent 并行→冲突→integration 分支手工重整」返工。
