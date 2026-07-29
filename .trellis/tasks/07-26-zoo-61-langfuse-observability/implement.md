# ZOO-61 Implementation Plan

1. 从 `origin/main@b3cb97f` 建立独立 `codex/zoo-61-langfuse-observability` worktree；不复用过期的 `codex/langfuse-tracing` 分支。
2. 在 `apps/agent` 增加 observer port、no-op/fake 测试辅助和隐私 allowlist 类型，先写生命周期与 fail-open 单元测试。
3. 实现 Langfuse/OpenTelemetry adapter、HMAC user ID、环境/release 配置、递归防御性 mask 和受控 warning。
4. 给 Agent Runtime 增加 optional observer hook：Turn root、assistant generation、Tool observation、完成/失败状态；保持 Conversation DTO 不变。
5. 在进程入口接入 telemetry start/shutdown；更新 `deploy/agent/.env.agent.example` 与 README，明确 Local/Production/Preview 和 Secret 边界。
6. 使用重新生成并安全存放的新 key 配置本地 Agent，执行真实 Turn smoke，并在 Langfuse 核对 trace/generation/Tool、environment、usage 和隐私字段。
7. 验证隐私、未配置、SDK 故障、Tool、multi-generation、错误和 shutdown；运行 Agent lint/test/build。
8. 在 ZOO-73 整合 ZOO-70、ZOO-74、ZOO-61 后运行 `pnpm verify`、本地 Agent/Workflow 全链路和 Langfuse 故障注入；正式 main 镜像部署时配置 Production Langfuse 并 smoke。

## Validation Commands

- `pnpm --filter @mewmo/agent test`
- `pnpm --filter @mewmo/agent lint`
- `pnpm --filter @mewmo/agent build`
- `pnpm verify`

## Risky Files And Gates

- `apps/agent/src/pi/runtime.ts`：只增加 optional hook，不改变 Tool、Session、SSE 或错误语义。
- `apps/agent/src/index.ts`：shutdown 必须有界且 fail-open，不能因 exporter 卡死进程。
- `apps/agent/src/config.ts`：缺少 Langfuse key 必须合法；半配置必须禁用并给出安全 warning，不能在错误中打印 key。
- `pnpm-lock.yaml`：只允许现有 Langfuse/OpenTelemetry 依赖链接到 Agent importer，不升级无关包。

## 2026-07-29 Extension Plan

1. Extend Agent ports/Harness bridge for provider payload, assistant output, Tool args/results, and Turn IO.
2. Extend Workflow adapters/observations for complete root and model IO.
3. Add code-owned Agent Prompt metadata plus an idempotent single-writer Langfuse sync command.
4. Link generations to synchronized managed prompt versions without making Langfuse a runtime dependency.
5. Replace business-content redaction assertions with payload visibility tests while preserving credential masking.
6. Run Agent and Workflow lint, test, and build; perform two sync smoke runs to prove idempotency.
