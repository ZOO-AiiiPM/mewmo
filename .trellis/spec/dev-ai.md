# mewmo 开发规范 · AI 层

> 本文件由 `AGENTS.md` 抽出的项目专属层。每条规范必须带 why。

- **AI 调用统一走 `packages/ai/`**：当前共享 Runtime 已用 `pi-ai` 统一 provider、模型 purpose、文本/结构化生成、usage/cost 与测试替身；Embedding 仍是迁移期 HTTP adapter，后端方案尚未定。目标边界是 Runtime 不放 Agent Loop、Cron、`AiRun` 扫描或业务工作流，但当前包仍保留 `legacy-agent`、summary 与旧 Prompt 导出供迁移兼容；新代码不得继续依赖这些旧出口。
- **业务编排按入口归属**：`apps/agent` 使用 `pi-agent-core` 的 AgentHarness、Session、compaction、Tool Registry、Skills 和 `AiAction` 确认闭环；`apps/ai-workflows` 只使用 Pi-backed Runtime 执行一次性 `AiRun`，不创建 Agent Session 或 Tool Loop；`apps/feed-ingestion` 只负责抓取、解析、入库并创建 queued `AiRun`。确定性的 ownership、幂等和状态转换由 `packages/application` 负责，持久化由 `packages/db` 负责。
- **Prompt/Eval 跟随产品 App**：Agent 的 Prompt/Eval 放 `apps/agent/prompts`、`apps/agent/evals`，Workflow 的放 `apps/ai-workflows/prompts`、`apps/ai-workflows/evals`；`packages/ai` 只提供加载和执行基础设施。这样调 Prompt 不会把产品编排倒灌进共享 Runtime。
- **会话与流式已迁入 Pi**：`AiSessionEntry` 是 Session Tree 真源，`AiTurn` 提供 lease、崩溃恢复和 `clientRequestId` 幂等；Agent SSE 只暴露带 `chatId`、`turnId`、递增 `seq` 的稳定产品事件，thinking、原始工具参数和结果留在服务端，避免内部推理与领域数据泄漏。`ai_chats`/Web DTO 是产品投影，不应重新作为 Harness 会话真源。
- **Memory 与凭据尚未完成**：当前只有会话 Session、compaction、页面上下文和通过 Tool 读取知识库；没有独立长期 Memory、语义记忆召回或专用向量数据库。`packages/ai` 类型预留 Pi `CredentialStore`，但生产仍使用服务端环境变量 API key，尚未接通用户 OAuth、BYOK 管理或 token refresh。
- **Usage 不等于 Langfuse**：`AiUsageEvent` 已记录 Agent/Workflow 的 token、cache、reasoning、provider/model 与可验证成本；Langfuse 目前只用于 `apps/ai-workflows/evals/live.ts` 的 `eval:live`，Production Runtime tracing 与告警尚未接入。

## Scenario: replace a chat turn and opt into Deep Thinking

### 1. Scope / Trigger

Editing or regenerating a persisted Mew turn replaces that turn and its suffix. Deep Thinking is an independent per-turn option and must not select the `deep-insight` Skill.

### 2. Signatures

- `POST /api/agent/chats/{chatId}/truncate` with `{ turnId: string }`.
- `truncateFromTurn(userId, chatId, turnId)` returns `{ count: number }`.
- Web and Agent message requests may carry `thinking?: boolean` independently of `skillId?: string`.

### 3. Contracts

A successful truncate atomically deletes `AiSessionEntry` rows from the target `entrySeq`, deletes the matching `AiTurn` suffix, and rolls `activeLeafId` back to the last surviving entry or leaf target. The replacement stream starts only after this succeeds. `thinking: true` maps to runtime thinking level `medium`; omission maps to `off` regardless of Skill.

### 4. Validation & Error Matrix

- Missing session -> HTTP 401.
- Empty or invalid `turnId` -> HTTP 400.
- Foreign or missing chat/turn -> HTTP 404 and no mutation.
- Truncate network/non-OK failure -> keep local transcript and draft; do not append.

### 5. Good/Base/Bad Cases

- Good: truncate an owned early turn, rebuild from the surviving leaf, then send the replacement.
- Base: send without `thinking`; runtime uses `off` and existing Skill behavior is unchanged.
- Bad: append replacement content after a failed truncate, or infer thinking from `deep-insight`.

### 6. Tests Required

Cover ownership, missing targets, transaction suffix deletion, leaf rollback, local fail-closed behavior, request-field propagation, and independent runtime thinking selection. Stop/send pointer tests must also protect the draft from the button swap.

### 7. Wrong vs Correct

Wrong: catch truncate failure and call the normal append path. Correct: return `false`, keep the draft/transcript recoverable, and start `performSend` without awaiting the full stream only after persistence truncation succeeds.
