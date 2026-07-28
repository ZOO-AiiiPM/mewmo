# ZOO-61 Technical Design

## Architecture

在 `apps/agent` 内定义小型 `AgentObservabilityPort`，Runtime 只发送已经结构化、去敏的 lifecycle 数据。Langfuse adapter 实现该 port；测试使用 fake/no-op 实现。Conversation DTO、Application Service 和数据库 schema 均不改变。

进程入口负责按环境变量创建 adapter 和管理 telemetry lifecycle：未配置时返回 no-op；已配置时启动 OpenTelemetry `NodeSDK` 与 `LangfuseSpanProcessor`。Local 使用 development environment，Production 使用 production environment；release 取正式 commit SHA。SIGINT/SIGTERM 先关闭 Fastify，再在有界超时内 best-effort shutdown telemetry。

## Trace Model

- Root：`agent.turn`，Langfuse observation type `agent`。
- Child：`agent.generation`，type `generation`。以 AgentHarness 的 assistant message lifecycle 配对；只在结束时写 provider/model、usage/cost、stopReason 和状态。
- Child：`agent.tool.<toolName>`，type `tool`。以 `toolCallId` 配对，只写 toolName、状态和 latency。
- Root metadata：chatId、turnId、purpose、environment、release、provider call count、configured max retries、公开错误 code/retryable。
- `sessionId=chatId`；`userId=HMAC-SHA256(AGENT_IDENTITY_SECRET, userId)`，不传原始 ID 或 email。

## Privacy Boundary

Port 类型本身不包含 user content、system prompt、page context、thinking、Tool args/result 或 assistant output。Adapter 再用 allowlist projector 和 Langfuse processor mask 做纵深防御。Error 只接受公开 code/retryable 与固定脱敏 status，不接受 provider 原始 message。

## Fail-Open

所有 observer 调用由 `safeObserve` 边界捕获；同步 SDK 错误不会回流 Runtime。异步 exporter 使用 batched 模式，失败只 warning。shutdown 使用短超时并吞掉 exporter 错误。无 key 或显式关闭时不初始化 SDK、不进行网络请求。

## Compatibility

- 使用仓库已有 `@langfuse/otel`、`@langfuse/tracing` 5.9.1 和 OpenTelemetry NodeSDK 版本，添加到 `apps/agent` 依赖。
- ZOO-70 合并时只需把 optional observability port 接到同一 AgentHarness lifecycle；不改稳定 SSE event。
- PostgreSQL `AiUsageEvent` 仍由 `MewmoSessionStorage` 写入，不依赖 Langfuse 成功。

## Rollback

移除 Langfuse key 或关闭 enable 配置即可退化为 no-op；无需 migration。代码回滚不会影响已持久化 Chat、Turn、Session 或 Usage。

## Configuration And Verification

真实 Secret 只进入被 Git 忽略的本地/服务器 Agent env，不进入仓库或 Linear。ZOO-61 用新 key 启动本地 Agent，发起至少一次含模型与 Tool 的 Turn，并在 Langfuse 查询 trace 层级和隐私字段；ZOO-73 从正式 main 构建镜像后注入 Production env、重启 Agent 并重复 smoke。任何截图或日志必须先检查不含 key、prompt、正文和 Tool payload。
