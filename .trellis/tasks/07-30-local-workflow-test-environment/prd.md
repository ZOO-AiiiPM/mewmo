# Local workflow test environment

## Goal

在开发机上提供一套连接 Preview Neon、与正式环境隔离的 Workflow 测试运行方式，复用现有 Langfuse Cloud 项目并将 trace 标记为 `development`，让 Workflow 能在本地端到端验证，而不消费或改写正式环境队列。

## Background

- 正式 Workflow 部署在远端 worker，按分钟运行，`LANGFUSE_ENVIRONMENT=production`。
- 本地 Agent 已从 `apps/agent` 启动并运行在 `127.0.0.1:3101`；它使用项目根 `.env.local` 中的 Preview Neon，本地 Langfuse 使用 `https://cloud.langfuse.com`，环境标记为 `development`。
- Agent 与 Workflow 是独立 runtime，必须维护彼此独立的环境配置；Workflow 只复用 Agent Preview 环境所使用的 Neon 和 Langfuse development credentials，不在运行时读取 Agent 配置。
- Workflow 当前入口是 one-shot runner：`apps/ai-workflows/src/commands/run-due.ts` 每次启动后处理一批 due runs 并退出。
- Worker Compose 已支持通过 `WORKER_ENV_FILE` 和 `WORKER_IMAGE` 注入独立环境与镜像：`deploy/worker/compose.yml`。
- Workflow Langfuse tracing 只有在 public key、secret key 和至少 32 字符的 `LANGFUSE_USER_HASH_SECRET` 同时存在时才启用；配置不完整会 fail-open 为 no-op：`apps/ai-workflows/src/observability/langfuse.ts`。
- 运行中 Agent 实际获得的 Preview Neon `DATABASE_URL` 指纹前缀为 `63bc482c6ff1`；该指纹可用于初始化和验证 Workflow 的独立本地配置，但连接串本身不得写入 Git 或日志。
- Workflow prompt 运行时直接读取仓库 Markdown；本地 canary 不执行 Langfuse prompt sync，不移动任何 Langfuse label：`apps/ai-workflows/src/prompts.ts`、`apps/ai-workflows/src/prompt-manifest.ts`。
- 现有 runner 会领取 due `AiRun` 并将其更新为 `running`，随后写入模型用量、业务结果或 retry/failure 状态；这些写入仅允许发生在 Preview Neon：`apps/ai-workflows/src/engine/run-batch.ts:29`、`apps/ai-workflows/src/engine/execute-run.ts:59-70`。
- Preview 数据库连接串曾在对话中明文出现；live canary 前必须在 Neon 轮换密码，并只把轮换后的 URL 写入 ignored env，不得继续使用已暴露凭据。

## Requirements

- 本地 Workflow 使用独立、gitignored 的 `.env.workflow.local`，不修改远端 `.env.worker`，运行时也不读取 Agent 的 `.env.local`。
- 初始化 `.env.workflow.local` 时，从已确认的 Agent Preview 环境复制轮换后的 Preview Neon、AI provider 和 Langfuse development 所需值；随后两套配置独立维护。
- 本地 Workflow 允许领取和回写 Preview `AiRun`；启动前正向校验 Preview 数据库指纹和 development 环境标记，指纹不匹配或任一环境为 `production` 时拒绝执行。
- 复用现有 Langfuse Cloud credentials，设置 `LANGFUSE_ENVIRONMENT=development`、development prompt label 和独立的本地 `LANGFUSE_USER_HASH_SECRET`。
- 提供明确的本地启动命令和 preflight（运行前检查），让开发者能安全执行 Workflow。
- 首版只提供手动 one-shot canary，不配置本地 Cron 或常驻调度。
- 正式环境的部署文件、Cron、环境变量和运行频率保持不变。
- 实现放在独立 feature branch/worktree，不覆盖当前 `main` 上的其他 WIP。

## Acceptance Criteria

- [ ] Preview 数据库中创建一条测试 `AiRun` 后，本地 Workflow 能处理并写回预期结果。
- [ ] 对应的 `AiUsageEvent` 被写入 Preview 数据库。
- [ ] Langfuse 中出现 `development` 环境的 Workflow trace，且不含原始用户 ID。
- [ ] 将配置指向非 Preview 数据库或把环境设为 `production` 时，preflight 明确报错并在处理队列前退出。
- [ ] 本地试跑前后，正式环境待处理队列和正式 Langfuse trace 不受影响。
- [ ] 现有 Workflow 单元测试、类型检查及相关部署配置校验通过。

## Out of Scope

- 修改正式服务器的 Workflow 部署或 Cron。
- 自建 Langfuse 服务或迁移现有 Langfuse Cloud 数据。
- 创建新的 Neon project/database，或改变 Preview/Production 数据模型。
- 连接或修改 Production Neon。
- 引入 Supercronic、Ofelia 等新的调度组件。
- 本地每分钟自动运行；Preview canary 验证完成后可作为后续增强。
- 改造 Workflow 业务逻辑、prompt 内容或 Agent 服务。


## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
