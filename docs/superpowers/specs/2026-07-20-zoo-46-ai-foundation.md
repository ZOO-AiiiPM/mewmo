# ZOO-46 共享 AI Foundation 与 Application Service Spec

## 状态与边界

本 Spec 已由用户确认的架构决策和 Linear ZOO-46 约束实施。`packages/ai` 是唯一模型 Runtime；`apps/agent` 与 `apps/ai-workflows` 选择逻辑 purpose，但不复制 Provider 配置。`packages/application` 承载确定性的权限、版本、确认和任务状态。具体 Agent Tool Loop、Workflow 编排、UI 与 MCP 不在本 Issue。

## AI Runtime

`createAIRuntime(config)` 支持同一 Provider 映射多个 purpose：Agent 对话、Deep Insight、摘要、推荐、Embedding、笔记轻量洞察和评测 Judge。Runtime 提供 `languageModel` 给 Vercel AI SDK Agent、`generateText`、经调用方 Schema 校验的 `generateObject`、`embed` 与无网络测试替身。`loadAIRuntimeConfig` 统一从环境变量构建 registry；App 不硬编码 modelId。

旧 `createModelClient`、摘要和 Legacy Agent export 暂时保留，避免迁移过程破坏当前 Web/Worker。新 Runtime 不依赖数据库、Application Service 或任何 App。

## Application Service

Actor 由可信入口注入 `userId`、来源和 scopes。Content Service 仅按 Actor 用户读取和搜索；Note Service 对创建、更新、移入废纸篓和恢复执行 scope、ownership 与 expectedVersion 校验。Agent/MCP 写入还必须关联已确认且参数版本一致的 AiAction。

AiAction 保存冻结 input、preview、风险、执行位置和可选 client effect。客户端动作确认后只进入 confirmed；客户端真实保存后调用 `recordResult` 才进入 succeeded/failed。服务端动作可进入 executing。失败动作可以在不改变冻结参数的情况下 retry。

AiRun 使用 PostgreSQL one-shot Cron：原子 `FOR UPDATE SKIP LOCKED` 领取，记录 worker lease 与 attempts，失效 lease 可恢复。完成摘要、Embedding、关系和笔记洞察时，在同一事务检查内容版本；版本变化则 superseded，不能覆盖新内容。失败使用有限指数退避。

## 数据模型

新增 `AiAction`、`AiRun`、`ContentEmbedding`、`ContentRelation` 与 Workflow 已明确要求的 `NoteInsight`。向量首版以 JSON 存储，避免本 Issue假设生产已启用 pgvector；后续 pgvector migration 可替换物理表示，不改变 Application 接口。

数据库 schema 不使用跨多种内容表的 polymorphic foreign key，因为 PostgreSQL/Prisma 无法表达一个字段同时引用 Note、Clip 与 FeedEntry。Application Service 每次按 userId、targetType、targetId 和版本校验真实资源。

## 验收

- 一个 Provider 可为多个 purpose 使用不同模型。
- Agent 可获得 AI SDK `LanguageModel`，Workflow 可调用 text/object/embedding。
- 模型 Runtime 不依赖业务和数据库。
- Agent 写入无确认时被拒绝，过期版本不能覆盖内容。
- AiRun 并发领取互斥，完成结果受 expectedVersion 保护。
- Prisma Client 可生成，相关 package test、build 与 lint 通过。
