# 考古补录（2026-07-26）

1. 工作已固化为 WIP `61dcbde`（15 文件 +1658/-88，worktree `.worktrees/zoo-61-langfuse-observability`，基于最新 main，工作区干净）。此前记录称已通过 Agent 74/74、build、verify——但那是死会话的口头记录，接手后先重跑验证再采信。
2. ⚠️ **真实 key smoke 前必须让用户重新生成 Langfuse key**：旧 key 曾在对话中暴露，禁止复用（ZOO-63 诊断的明确结论）。
3. 旧 worktree `.worktrees/langfuse-tracing`（分支 `codex/langfuse-tracing`）已被本 worktree 替代，在分支收敛任务中删除。
