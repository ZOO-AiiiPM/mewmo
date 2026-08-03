# mewmo 开发规范 · AI 层

> 本文件由 `AGENTS.md` 抽出的项目专属层。每条规范必须带 why。

- **AI 调用统一走 `packages/ai/`**：当前共享 Runtime 已用 `pi-ai` 统一 provider、模型 purpose、文本/结构化生成、usage/cost 与测试替身；Embedding 仍是迁移期 HTTP adapter，后端方案尚未定。目标边界是 Runtime 不放 Agent Loop、Cron、`AiRun` 扫描或业务工作流，但当前包仍保留 `legacy-agent`、summary 与旧 Prompt 导出供迁移兼容；新代码不得继续依赖这些旧出口。
- **业务编排按入口归属**：`apps/agent` 使用 `pi-agent-core` 的 AgentHarness、Session、compaction、Tool Registry、Skills 和 `AiAction` 确认闭环；`apps/ai-workflows` 只使用 Pi-backed Runtime 执行一次性 `AiRun`，不创建 Agent Session 或 Tool Loop；`apps/feed-ingestion` 只负责抓取、解析、入库并创建 queued `AiRun`。确定性的 ownership、幂等和状态转换由 `packages/application` 负责，持久化由 `packages/db` 负责。
- **Prompt/Eval 跟随产品 App**：Agent 的 Prompt/Eval 放 `apps/agent/prompts`、`apps/agent/evals`，Workflow 的放 `apps/ai-workflows/prompts`、`apps/ai-workflows/evals`；`packages/ai` 只提供加载和执行基础设施。这样调 Prompt 不会把产品编排倒灌进共享 Runtime。
- **会话与流式已迁入 Pi**：`AiSessionEntry` 是 Session Tree 真源，`AiTurn` 提供 lease、崩溃恢复和 `clientRequestId` 幂等；Agent SSE 只暴露带 `chatId`、`turnId`、递增 `seq` 的稳定产品事件。模型实际返回的 reasoning 可作为独立 thinking 事件展示，工具只暴露经过 allowlist/sanitize 的标题、公共 URL 与结果摘要，原始参数、原始结果和领域内容仍留在服务端，避免把敏感数据混入产品时间线。`ai_chats`/Web DTO 是产品投影，不应重新作为 Harness 会话真源。
- **Memory 与凭据尚未完成**：当前只有会话 Session、compaction、页面上下文和通过 Tool 读取知识库；没有独立长期 Memory、语义记忆召回或专用向量数据库。`packages/ai` 类型预留 Pi `CredentialStore`，但生产仍使用服务端环境变量 API key，尚未接通用户 OAuth、BYOK 管理或 token refresh。
- **Usage 不等于 Langfuse**：`AiUsageEvent` 是 Agent/Workflow 的业务 usage 真源；Agent 在配置 Langfuse 时另建 Turn → Generation → Tool observation，记录请求模型、实际可得的响应模型、`reasoning.effort` 与 reasoning token。Langfuse 是调试/评测观测层，写入失败不得阻断用户请求。

## Scenario: replace a chat turn and opt into Deep Thinking

### 1. Scope / Trigger

Editing or regenerating a persisted Mew turn replaces that turn and its suffix. Deep Thinking is an independent per-turn option and must not select the `deep-insight` Skill.

### 2. Signatures

- `POST /api/agent/chats/{chatId}/truncate` with `{ turnId: string }`.
- `truncateFromTurn(userId, chatId, turnId)` returns `{ count: number }`.
- Web and Agent message requests may carry `thinking?: boolean` independently of `skillId?: string`.

### 3. Contracts

A successful truncate atomically deletes `AiSessionEntry` rows from the target `entrySeq`, deletes the matching `AiTurn` suffix, and rolls `activeLeafId` back to the last surviving entry or leaf target. The replacement stream starts only after this succeeds. Deep Thinking is a persistent composer toggle: `thinking: true` maps to `high`; false or omission maps to `low`, independently of Skill. Sending a message must not clear the toggle.

### 4. Validation & Error Matrix

- Missing session -> HTTP 401.
- Empty or invalid `turnId` -> HTTP 400.
- Foreign or missing chat/turn -> HTTP 404 and no mutation.
- Truncate network/non-OK failure -> keep local transcript and draft; do not append.

### 5. Good/Base/Bad Cases

- Good: truncate an owned early turn, rebuild from the surviving leaf, then send the replacement.
- Base: send without `thinking`; runtime uses `low` and existing Skill behavior is unchanged.
- Bad: append replacement content after a failed truncate, or infer thinking from `deep-insight`.

### 6. Tests Required

Cover ownership, missing targets, transaction suffix deletion, leaf rollback, local fail-closed behavior, request-field propagation, and independent runtime thinking selection. Stop/send pointer tests must also protect the draft from the button swap.

### 7. Wrong vs Correct

Wrong: catch truncate failure and call the normal append path, or consume Deep Thinking after one send. Correct: return `false`, keep the draft/transcript recoverable, start `performSend` without awaiting the full stream only after persistence truncation succeeds, and preserve the toggle until the user turns it off.

## Scenario: capture a public URL from Agent chat

### 1. Scope / Trigger

An explicit save/bookmark/clip request or public-feed subscription request may write immediately. A bare URL, reading, summarizing, or searching is not write authorization.

### 2. Signatures

- `ApplicationPort.urls.saveClip(actor, url) -> { action: "clip_saved", status: "created" | "existing", title }`
- `ApplicationPort.urls.subscribeFeed(actor, url) -> { action: "feed_subscribed", status: "created" | "existing", title }`
- Agent tools: `clip_url_save({ url })`, `feed_url_subscribe({ url })`

### 3. Contracts

Both Agent and Web call the same actor-scoped application commands. Clip creation retains normalized identity, active duplicate lookup, deleted duplicate restore, metadata persistence, and workflow enqueue. Feed creation retains discovery, initial fetch lease/status, FeedEntry writes, workflow enqueue, duplicate retry, and failure rollback. Agent tool observations expose only action, hostname, and sanitized status.

### 4. Validation & Error Matrix

- Missing `content:write` scope -> forbidden, no write.
- Invalid, credentialed, private-network, authenticated, or unrecognized URL -> safe public failure, no write.
- Active owned duplicate -> `existing`; foreign records never match.
- Feed initial-fetch failure -> delete the newly created Feed and cascade its FeedEntries; a zero-count or failed rollback is an error.
- Unexpected persistence failure -> generic Agent error; Web preserves its existing 500 behavior rather than reporting a fetch 502.

### 5. Good/Base/Bad Cases

- Good: "收藏这个网页" calls `clip_url_save`; "订阅这个 RSS" calls `feed_url_subscribe`.
- Base: an owned duplicate returns `existing` without a second record.
- Bad: a URL-only or summary request calls any write tool, or a failed initial import leaves a Feed/FeedEntry.

### 6. Tests Required

Cover owner filters, normalized duplicates, deleted Clip restore, Feed rollback count, duplicate refresh ownership, workflow enqueue, SSRF fail-closed, sanitized errors/events, unchanged Web response status/body, and live-model intent for two positive plus URL-only/read/summary negative cases.

### 7. Wrong vs Correct

Wrong: implement Prisma/fetch loops inside the Agent adapter or map every Clip service exception to Web 502. Correct: share the application command, keep transport-specific response mapping at Web, and sanitize only the Agent projection.

## Scenario: stream DeepSeek reasoning, tools, and terminal state

### 1. Scope / Trigger

Agent chat and deep-insight use DeepSeek's paid OpenAI-compatible Responses endpoint. AI Workflows keep their existing one-shot adapter/model path.

### 2. Contracts

- Agent configuration must send the provider-supported Responses model id `deepseek-v4-flash`; `deepseek-chat` is not a valid model id for this endpoint. Fix model selection at configuration, never by patching the provider adapter or rewriting response metadata.
- Process blocks preserve provider event order: reasoning, assistant narration, tool start/result. Only the terminal answer renders outside the collapsible process region.
- `turn.completed` is authoritative. A later `result`, clean EOF, or transport error must not revert the row to sending/failed or replace terminal content with an earlier partial projection.
- Langfuse records the sanitized flat model parameter `reasoning.effort=low|high`; reasoning token `0` is valid when the provider emits no reasoning for that request.

### 3. Tests Required

Cover persistent consecutive sends, low/high payload mapping, reasoning/tool/final ordering, sanitized expandable tool details, terminal-followed-by-transport-error settlement, sequence-gap reconciliation, and light/dark icon visibility. Real acceptance must include authenticated DeepSeek streaming plus Langfuse evidence for both effort values.
