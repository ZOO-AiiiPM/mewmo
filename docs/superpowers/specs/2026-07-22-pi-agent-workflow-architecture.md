# Pi Agent 与 AI Workflow 技术架构

## 状态

本 Spec 沉淀 2026-07-22 已确认的 Agent 与 AI Workflow 技术边界，覆盖并修订 ZOO-45、ZOO-46、ZOO-47 中关于 Vercel AI SDK Tool Loop、扁平会话消息和模型调用的旧假设。

本次只冻结 Agent Harness、共享模型 Runtime、Workflow 执行方式、会话、Tool、Skill、认证和 Usage/计费边界。Embedding Provider、向量数据库、长期 Memory 产品模型仍待单独调研和决策；本文只保留它们需要接入的位置，不选择实现。

Linear 追踪：

- [ZOO-50：采用 Pi 统一 Agent 与 AI Workflow Runtime 架构](https://linear.app/zoos-agent-lib/issue/ZOO-50/采用-pi-统一-agent-与-ai-workflow-runtime-架构)
- [ZOO-51：迁移 Agent 到 Pi AgentHarness 与 PostgreSQL Session](https://linear.app/zoos-agent-lib/issue/ZOO-51/迁移-agent-到-pi-agentharness-与-postgresql-session)
- [ZOO-52：迁移 AI Workflows 到 Pi-backed Runtime 与统一 Usage](https://linear.app/zoos-agent-lib/issue/ZOO-52/迁移-ai-workflows-到-pi-backed-runtime-与统一-usage)

## 目标

- 最大化复用 Pi 已提供的模型、Agent、会话、Skill、压缩、认证和 Usage 基础设施，避免 Mewmo 重写通用 Agent Runtime。
- 保留 Mewmo 已实现的权限、ownership、乐观锁、AiAction 确认、AiRun lease、业务事务和产品前端。
- 让实时 Agent、固定 AI Workflow 和定时 Agent 自动化共享 AI Foundation，但保持不同的执行语义。
- 用稳定的 Mewmo Port 隔离 Pi 的快速版本变化，使升级只影响少量 Adapter。

## 非目标

- 不决定 Embedding 模型、向量数据库或长期 Memory 方案。
- 不把 Pi Coding Agent 的终端、文件、Shell 或 TUI 引入 Mewmo。
- 不用 Pi OAuth 替代 Auth.js/Mewmo 用户认证。
- 不让普通摘要、关系计算或洞察任务进入 Agent Tool Loop。
- 不在本 Spec 中重新设计现有 Web/Apple 产品界面。

## 总体架构

```text
packages/ai
  Pi Models / Provider / Auth / Usage / Cost
  + Mewmo logical model purpose registry
  + generateText / generateObject adapter
  + 独立 Embedding port（实现待定）

apps/agent
  Pi AgentHarness / Session / Compaction / Skill / Tool Loop
  + Mewmo Tool Registry / Safety / Streaming
  + Pi SessionStorage -> Application Port adapter

apps/ai-workflows
  AiRun one-shot Cron
  + 固定 summary / relation / note-insight pipeline
  + packages/ai，不默认使用 AgentHarness

packages/application
  Actor / ownership / version / idempotency / transaction
  + AiAction / AiRun / Agent turn lease

packages/db
  Prisma schema / repositories
```

依赖方向保持为 App 组合基础设施。`packages/ai` 不依赖 App、Application 或数据库，也不承载 Agent Loop 和 Workflow 编排。`packages/application` 不依赖 Pi；`apps/agent` 的 Adapter 将 Pi Session/Tool 类型转换为 Application DTO。

## Pi 采用边界

### 直接采用 pi-ai

`packages/ai` 使用 `@earendil-works/pi-ai` 的 Models、Provider factory、统一消息与 Tool Call 协议、流式事件、Thinking、Retry、Timeout、Prompt Cache、CredentialStore、OAuth/API Key 解析、模型目录、Usage 和 `calculateCost`。

Mewmo 继续保留逻辑 purpose，例如 `agent.chat`、`agent.deep-insight`、`workflow.summary`、`workflow.recommendation`、`workflow.note-insight`、`eval.judge`。App 只选择 purpose，物理 provider/modelId 由 `packages/ai` 映射。

`pi-ai` 当前没有 Embedding API，也没有等价于应用级 `generateObject` 的独立高层接口。因此 `generateText` 基于 Pi Models；`generateObject` 在其上增加调用方 Schema 校验和有限重试；`embed` 保留独立 Port，待 Embedding/Memory 方案确定。

### 受控采用 pi-agent-core

`apps/agent` 采用 Pi `AgentHarness`、Agent Loop、Tool 执行、事件、Session、Compaction、Skill/Prompt Template 格式、steering、follow-up 和 abort。

Pi 0.81 的 AgentHarness 仍在快速演进，官方文档尚未将其视为完全 migration-ready。因此必须精确锁版本，并只允许 `apps/agent/src/pi/**` 暴露 Pi 具体类型。Mewmo 其他模块依赖自有 Port，禁止把 Pi SessionEntry、AgentTool 或 Model 类型扩散到 Web/Application DTO。

暂不依赖 Pi 尚未稳定的 durable recovery 和通用 Extension/Hook 体系。自动压缩的决策由 Mewmo 调用 Pi 的 `shouldCompact`/`compact`；分布式并发和崩溃恢复由数据库 Turn Lease 处理；未完成写 Tool 不自动重放。

不采用 `pi-coding-agent`、`pi-tui`、`pi-server` 或 `pi-storage-sqlite-node` 的运行实现。官方 SQLite Session Schema 可作为 PostgreSQL Adapter 的行为参考。

## Agent 架构

### 一次交互

```text
Web / Apple
  -> apps/agent 验证 Mewmo identity
  -> Application beginTurn：ownership、clientRequestId 幂等、领取 chat lease
  -> 打开 PostgreSQL Pi SessionStorage
  -> 加载系统 Prompt、Skill、允许的 Tools、逻辑模型 purpose
  -> AgentHarness.prompt()
  -> 流式转发 text/thinking/tool lifecycle
  -> SessionStorage 持久化 user/assistant/toolResult/compaction entry
  -> 写 AiUsageEvent
  -> Application finishTurn 并释放 lease
```

同一 Chat 的并发请求不能只依赖 AgentHarness 的进程内 busy 状态；多个 Agent 实例之间必须由 PostgreSQL Turn Lease 互斥。进程崩溃后将未完成 Turn 标为 interrupted/failed，允许用户安全重试，但不自动重放可能产生副作用的 Tool。

### Tool 与写操作

Pi 统一不同 Provider 的 Tool Call/Tool Result 协议，并由 AgentHarness 校验 TypeBox 参数和执行 Tool。Mewmo Tool 只负责把已验证输入交给 Application Service。

读取链路保留 `read_current_context`、`content_search`、`content_read`。未来检索/Memory 方案只替换 `content_search` 背后的 Search Port，不改变 Agent Tool 协议。

写入链路必须保持：

```text
Pi ToolCall
  -> Mewmo note/knowledge Tool
  -> 创建冻结参数的 AiAction proposal
  -> ToolResult 告知模型等待确认
  -> 用户确认
  -> Application Service 校验 action、ownership、expectedVersion、idempotency
  -> 真正执行写入并记录结果
```

永久删除和 Feed/FeedEntry 删除继续不对 Agent 开放。`beforeToolCall` 可做 active tool、scope 和风险策略预检，但 Application Service 仍是最终安全边界。

### Skill

预设 Skill 可直接使用 Pi `SKILL.md` loader。数据库中的用户 Skill 映射到同一 `Skill` 结构，但额外保存 Mewmo 业务元数据：owner、version、enabled、modelPurpose 和 allowedTools。

Pi Skill 本身只提供内容与调用格式，不限制 Tools。Mewmo `runSkill` 必须先应用 allowedTools，再调用 Harness Skill；Tool 权限不能只写在 Prompt 中。

### 会话与短期记忆

Pi Session 是 Agent 短期记忆与可恢复上下文的唯一协议。它不仅保存聊天文本，还保存 Tool Result、模型/Thinking/Active Tool 变化、Compaction、Branch Summary 和自定义 Entry。

现有 `AiMessage(role/content)` 无法无损表示 Pi Session。目标数据库结构为：

- `AiChat`：用户 ownership、Session 元数据、activeLeafId、nextEntrySeq、可选 parentChatId。
- `AiSessionEntry`：chatId、entryId、entrySeq、parentId、type、payload、timestamp，作为会话唯一真源。
- `AiTurn`：clientRequestId、状态、lease、最终 Entry、错误与幂等。
- `AiContextAttachment`：关联可展示的 Message Entry。

Web API 从 `AiSessionEntry(type=message)` 投影现有消息 DTO，不维护第二份聊天真源。长期 Memory 不写入 Pi Session；其事实记录、召回和遗忘策略等待 Memory 方案确认。

## Workflow 架构

### 固定 AI Workflow

摘要、关系判断和笔记洞察继续由 `apps/ai-workflows` 的 one-shot Cron 执行：领取有限批次 AiRun，运行固定 Pipeline，成功/失败/重试后退出。它们共享 `packages/ai` 的 Pi Provider、Models、Auth、Usage、Cost、Retry 和测试替身，但不使用 AgentHarness 或 Pi Session。

```text
AiRun(summary)
  -> getInput
  -> packages/ai.generateText
  -> completeSummary
  -> AiUsageEvent

AiRun(relation / note_insight)
  -> 候选召回 Port（实现待定）
  -> packages/ai.generateObject
  -> completeRelations / completeNoteInsight
  -> AiUsageEvent
```

Embedding Workflow 的 AiRun、版本、lease、幂等与状态链路保留，但实际 Embedding Client、存储和检索后端不在本 Spec 决策范围内。

### 定时 Agent 自动化

会自主搜索、读取、判断并调用写 Tool 的日报、周报或用户自动化不是固定 Workflow。`apps/ai-workflows` 只按 Cron 创建 `AiRun(kind=agent_automation)`；`apps/agent` 的独立命令领取这类 Run，并用同一 AgentHarness、Skill、Tool Registry 和安全策略执行。两 App 通过 PostgreSQL/Application Service 交接，不直接互调。

固定 Workflow 与 Agent Automation 可以共用 AiRun 运行信封，但 claim 必须按 kind 隔离：`apps/ai-workflows` 不得领取 Agent Run，`apps/agent` 不得领取 summary/relation/note-insight Run。

## Auth 与凭证

Pi CredentialStore 管模型 Provider 凭证，不替代 Mewmo Auth.js。第一阶段后台 Agent/Workflow 使用 Mewmo 服务器凭证。未来 BYOK/OAuth 使用绑定 userId 的加密 PostgreSQL CredentialStore；Models/CredentialStore 必须按用户作用域创建，不能在用户之间共享。

订阅型 OAuth 是否可嵌入第三方 SaaS 必须先核对 Provider 条款。未确认前只保留接口，不默认开放。无人值守 Workflow 遇到用户 OAuth 失效时标记 Run 需要重新授权，不回退到其他用户或未声明的全局凭证；Feed 入库不受 AI 凭证失败阻塞。

## Usage、成本与计费

Pi Usage 是所有生成调用的统一观测格式，必须完整保留 input、output、reasoning、cacheRead、cacheWrite、provider/model、responseModel 和 Pi 计算成本。Agent Assistant Entry、Compaction 和 Workflow Run 都关联 append-only `AiUsageEvent`。

`AiUsageEvent` 至少保存 userId、chatId/runId、purpose、operation、provider、requestedModel、responseModel、各类 Token、providerCost、价格快照、产品 Credits 和唯一幂等键。

Pi 成本是按模型目录计算的估算 Provider Cost，不等于供应商最终账单，也不包含 Mewmo 套餐或倍率。产品计费基于独立账本，不能临时汇总 Session JSON 后直接扣费。自定义 OpenAI-compatible Provider 必须显式提供模型价格；未知价格不能伪装成零成本。

## 迁移顺序

1. 在 `packages/ai` 引入并精确锁定 Pi，先替换 Provider/Models/Usage/Auth，保持现有高层 Runtime API 可兼容迁移。
2. 建立 `AiSessionEntry`、`AiTurn`、`AiUsageEvent` 和 PostgreSQL SessionStorage Port；迁移现有 AiChat/AiMessage 数据。
3. 在 `apps/agent` 用 Pi AgentHarness 替换 Vercel AI SDK ToolLoopAgent，并迁移现有 Tool Registry、AiAction 和流式事件。
4. 将预设 Skill 接入 Pi 格式，再增加数据库用户 Skill 与 allowedTools 策略。
5. 将 `apps/ai-workflows` 的文本/结构化调用迁到 Pi-backed `packages/ai`，并记录完整 Usage。
6. 增加 Agent Automation Run kind 与 `apps/agent` Cron command。
7. Embedding、向量数据库和长期 Memory 在独立决策通过后接入预留 Port。

## 验收标准

- Agent 和 Workflow 不再各自实现 Provider、模型路由、Usage、Cost 或 Credential 解析。
- Agent 使用 Pi Tool Call 协议执行现有读取 Tool，写 Tool 仍必须经过 AiAction 确认。
- Chat 重开后能够恢复 Tool Result、Compaction 和活动分支，而非只恢复纯文本。
- 同一 Chat 的并发 Turn 被数据库互斥，重复 clientRequestId 不重复调用模型或创建 Action。
- Agent、Compaction、固定 Workflow 的模型调用均产生幂等 AiUsageEvent。
- 固定 Workflow 不启动 Agent Loop；Agent Automation 复用 apps/agent 的 Harness 和安全策略。
- Pi 版本升级的代码变化被限制在 `packages/ai` 和 `apps/agent/src/pi/**` Adapter。
- Embedding/Memory 未决策时，不新增具体向量数据库依赖，也不把向量 JSON 方案写成长期承诺。

## 风险与冻结项

- Pi 0.81 在 SessionStorage 和 AgentHarness 上仍有破坏性变化，必须锁精确版本、保留 Adapter Contract Test，并经人工升级。
- Pi 尚未提供 durable in-flight recovery；Mewmo 必须用 AiTurn/AiRun lease 明确中断边界。
- OAuth 能力可复用不代表 Provider 允许第三方 SaaS 使用订阅凭证，开放前需要合规确认。
- Embedding、向量检索和长期 Memory 共同影响数据模型，但不应为了赶 Agent 迁移而提前绑定某个后端。

## 参考

- Pi monorepo: https://github.com/earendil-works/pi
- pi-ai: https://github.com/earendil-works/pi/tree/main/packages/ai
- pi-agent-core: https://github.com/earendil-works/pi/tree/main/packages/agent
- AgentHarness 状态: https://github.com/earendil-works/pi/blob/main/packages/agent/docs/agent-harness.md
- SessionStorage 契约: https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/types.ts
- SQLite Session Schema: https://github.com/earendil-works/pi/blob/main/packages/storage/sqlite-node/src/sqlite/migrations/001_initial.sql
