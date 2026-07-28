# 生产服务器 Agent/Embedding 不可用排障

## Goal

诊断并修复生产服务器（101.36.117.253）上「agent 完全用不了、embedding 模型完全失败」的问题（2026-07-25 用户报告，至今零进展）。

## Background

- 来源：会话 0b2fe6d0（7/25），两次 SSH 都被权限分类器拦截、随后 429 死亡，服务器侧数据为零。见 `.trellis/workspace/zoo/session-briefs/small-sessions-verdicts.md`。
- 入口线索：`deploy/PR27-deployment-handoff.md`（部署交接文档，含环境要求）+ `apps/agent/src/config.ts` 环境变量定义。
- 相关近因：PR #27（PGVector/Jina/Gemini/embedding）与 #29（Google provider env 修复）都涉及 provider/env 配置——**#29 修的正是「部署即崩」的 env 衔接坑**，服务器可能还跑着未含 #29 的旧代码或旧 env。
- 参考：本地跑通 agent 的经验（`.trellis/workspace/zoo/session-briefs/convergence-execution.md`）：需要 `AGENT_SERVER_URL/AGENT_INTERNAL_SECRET/AGENT_IDENTITY_SECRET(≥32)`，且旧代码不认 `AI_PROVIDER=google`。

## Requirements

- 先确认问题是否仍存在（可能已被后续操作解决）。
- SSH 查服务器：部署的 commit 版本、容器/进程状态、agent 与 embedding 的报错日志、env 完整性（对照 shared env schema）。
- 定位根因并修复；如需重新部署，遵循 `deploy/PR27-deployment-handoff.md`。

## Acceptance Criteria

- [ ] 根因结论 + 证据（日志/版本号）
- [ ] agent 对话在生产可用、embedding 调用成功的验证证据
- [ ] 修复步骤与配置变更记录进 deploy 文档
