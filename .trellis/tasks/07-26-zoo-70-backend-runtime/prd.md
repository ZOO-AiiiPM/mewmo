# 接手 ZOO-70 后端 Runtime（WIP 246e102）

## Goal

把 WIP 提交 `246e102`（Session 存储、SSE Runtime、恢复协议、migration `20260725070000_fix_default_agent_sessions`）验证、收尾并推成 PR。ZOO-70 是 ZOO-63 epic 的关键路径最上游，被 ZOO-74（前端会话）和 ZOO-73（整合）双重依赖。

## Background

- 工作现场：worktree `.worktrees/zoo-63-agent-session-fixes`，分支 `codex/zoo-70-backend-runtime`，基于最新 main（b3cb97f）领先 1 个提交，工作区干净。
- 21 个文件、+702/-57。产出者会话已死，上下文见 `.trellis/workspace/zoo/session-briefs/convergence-execution.md` 第「关键认知」节。
- ⚠️ 该提交含 Prisma migration——与 ZOO-76（passwordChangedAt migration）及任何其他 schema 改动必须排队合入，勿并行。

## Requirements

- 对照 Linear ZOO-70 的验收标准逐条核对 `246e102` 的实现完整性（该提交是抢救性 WIP，未经任何验证）。
- 跑通 build + 相关测试（runtime.test 等），补缺失测试。
- 确认 Conversation Event 协议与 ZOO-74 前端任务书（`.trellis/tasks/07-26-zoo-74-frontend-conversation/prd.md`）中的服务端缺口描述（`chatId/turnId/seq` 稳定事件、断线补发）是否由本提交补齐；不齐则列出剩余缺口。

## Acceptance Criteria

- [ ] build、test、`pnpm verify`（如适用）全绿，有输出证据
- [ ] 与 Linear ZOO-70 验收标准逐条对照的核对表
- [ ] 分支推送 + PR 创建（推送前需用户确认）
- [ ] migration 合入顺序与其他 schema 改动协调完毕

## Notes

- 复杂任务：`task.py start` 前建议补 design.md（协议对照）+ implement.md。
