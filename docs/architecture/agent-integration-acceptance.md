# Agent Integration、验收与正式发布（ZOO-73）

> Integration 工作包验收与交付记录。约束以父 Issue ZOO-63 附件 Spec（Agent D：
> Integration、验收与发布）为准。本文件记录本地全链路验收证据、交付/回滚步骤，
> 以及仍需用户执行的生产验收清单。

## 1. 交付边界与所有权

本工作包（Spec §12 Agent D）负责：

- 跨应用 integration/E2E 测试与故障注入夹具。
- 浏览器验收框架与证据清单（浏览器侧以 `tests/unit/agent-*.test.ts` + web BFF 静态契约覆盖）。
- 验收证据、部署与回滚记录。
- 从正式 `main` 构建镜像、健康检查与生产交付准备。

**协作边界**：发现功能缺陷应回传对应所有者（Agent A Backend / Agent B Frontend /
Agent C Observability），不在集成分支平行重写 Runtime/UI/Observability。Automation
scheduler/executor 不交付、不部署、不验收（ZOO-63 Spec §2 Decision #7）。

## 2. 验收场景与故障注入覆盖

本地真实全链路测试通过真实 Agent Fastify 服务器 + 真实 PostgreSQL
（`packages/application` + `packages/db`）+ 确定性 fake provider 驱动，覆盖 ZOO-63
Spec §14 的以下场景（见 `tests/integration/agent-e2e.test.mjs`）：

| 验收场景 | 注入方式 | 断言 |
|---|---|---|
| 健康检查与认证边界 | 公开 `/health`；无身份 token 访问 Agent 路由 | 200/401 |
| 单个 Turn 完成并持久化 | 真实模型调用 + fake provider 返回文本 | 200、user/assistant 消息、`AiTurn.status=succeeded` |
| 重复 `clientRequestId` 幂等 | 相同 requestId + 相同 content 再次提交 | 返回持久化缓存，`AiUsageEvent` 不重复 |
| 租约内重复请求守卫 | 手工插入 running + 有效 lease 的 turn 后重放 | 409 `conflict`（at-most-once） |
| SSE 协议稳定事件序列 | `/stream` 读取 `turn.started → assistant.text.delta → turn.completed` | 事件带 chatId/turnId、seq 单调递增，`turn.completed.message` 为权威投影 |
| 模型失败 → 可重试 `turn.failed` | 空 provider 响应队列（`agentResponses: []`） | HTTP 503 `dependency_unavailable`，`AiTurn.status=failed` |
| 失败后重试恢复 | 重启服务器换回健康 fake provider + 新 `clientRequestId` | 200 恢复，不重复写 |

故障注入夹具把「刷新、断网、并发 Turn、重复 clientRequestId、Agent 重启、模型失败、
Langfuse 不可用」映射为可断言的确定性 fixture：

- **重复 clientRequestId / 并发 Turn**：`beginTurn` 的 requestHash + 租约语义（见
  `packages/application/src/ai-session-service.ts`）本地用真实 Postgres 验证幂等与 409。
- **模型失败 + Agent 重启**：fake provider 空队列 + 重新启动服务器，验证 `turn.failed`
  与「新 requestId 安全重试」。
- **Langfuse 不可用（fail-open）**：`apps/agent/src/observability/langfuse.test.ts` 与
  `packages/ai` 的 fail-open 单元测试覆盖；Langfuse 不在 Turn/AiUsageEvent 完成条件内。

## 3. 运行与验证命令

```bash
# 自包含单测（含 agent runtime / observability / safety allowlist）
pnpm test:unit

# 真实 API 集成测试（脚本自建一次性 PostgreSQL + Web + fixture，含本 agent E2E 测试）
pnpm test:integration

# 主题硬编码策略扫描
pnpm test:theme

# 生产最低本地闸门（lint + 单测 + 主题 + 构建）
pnpm verify
```

> 已知项：`pnpm test:unit` 存在 2 个既有的视觉契约失败（废纸篓阅读器工具栏间距、
> prototype cat-head SVG），属 Frontend 视觉契约（非本工作包范围）且在变更前 `main`
> 同样失败；不在本工作包修复，避免越界改动 Frontend UI 契约。

## 4. Agent 镜像构建（正式 `main`）

只从验证通过的正式 `main` 构建镜像。命令见 `deploy/agent/README.md`：

```bash
IMAGE_TAG=<commit-sha>
PNPM_REGISTRY=https://registry.npmmirror.com
docker buildx build --platform linux/amd64 --build-arg PNPM_REGISTRY="$PNPM_REGISTRY" \
  -f deploy/agent/Dockerfile -t "mewmo-agent:$IMAGE_TAG" --load .
docker image inspect "mewmo-agent:$IMAGE_TAG" --format '{{.Architecture}} {{.Os}}'
```

镜像检查结果必须是 `amd64 linux`。

## 5. 交付证据与回滚记录

**交付时记录**（作为部署当次的不可变证据）：

- 构建镜像所依据的 `commit SHA`。
- 镜像 `image digest`（`docker image inspect mewmo-agent:<sha> --format '{{.Id}}'`）。
- 数据库 `migration version`：`pnpm db:migrate:status` 输出 `_prisma_migrations`
  对应 migration 名，按 `deploy/database/README.md` 执行 `pnpm db:migrate:deploy`；
  Preview/Production 禁止 `db:push`。
- 服务健康检查：`curl --fail http://127.0.0.1:3101/health` 与
  `docker exec agent-caddy-1 wget -qO- http://mewmo-agent-agent-1:3101/health`。

**回滚步骤**（`deploy/agent/README.md`）：

```bash
cd /www/wwwroot/mewmo-agent
docker tag "mewmo-agent:<上一 commit-sha>" mewmo-agent:local
docker compose -f compose.yml up -d
```

运行时与 UI 可分别回滚到上一 image/deployment；不得回滚已持久化用户数据。数据库
Schema 必须同时兼容新旧版本（恢复依赖 Neon 备份/分支或 forward-fix migration，
见 `deploy/database/README.md`）。

## 6. 仍由用户执行的 Production 验收（本工作包不勾选）

按 ZOO-63 Spec §14「发布」与 §17 完成定义，以下必须由用户亲自验收，期间 ZOO-63/
ZOO-73 不做最终 Done：

- [ ] 登录后建立/恢复 Session；Tool Call / Tool Result / Skill / Compaction / SSE 可用。
- [ ] 写操作经 AiAction 提案、用户确认、ownership、expectedVersion 与幂等校验。
- [ ] 刷新、断网、并发 Turn、重复 clientRequestId、Agent 重启、模型失败可恢复且不重复执行。
- [ ] AiUsageEvent 记录 token/provider/model/cost snapshot 与错误/重试信息。
- [ ] Production Langfuse 可看到 Agent trace/session/user，token/cost 与
      `AiUsageEvent` 抽样核对，缺失观测 fail-open。
- [ ] Feed 入库、AiRun enqueue/claim/complete/retry/fail 全链路可追踪；固定 Workflow
      每分钟 Cron 可运行、无任务快速退出、结果幂等写回。

本地全链路与浏览器测试全部通过后，才从正式 `main` 构建镜像交付；用户确认前，本
Issue 与 ZOO-63 保持未完成状态（Spec §14/§16/§17）。

## 7. 实现要点与踩坑（来自本工作包验收）

这些是编写 Agent E2E 集成测试时验证过的硬约束，供后续开发复用：

- **`createFakeAIRuntime` 的 `generateText` 选项不影响 Agent 运行时。**
  `createAgentRuntime` 把 `options.ai.model(purpose)` 交给 Pi AgentHarness，走
  proto 驱动的模型路径，而不是 `generateText`。要让确定性 provider 返回文本必须用
  `agentResponses`；要让 provider 失败则传空数组 `agentResponses: []`（队列耗尽 →
  可重试 `dependency_unavailable` / HTTP 503）。
- **`agentResponses` 是脚本队列，一次 Turn 可能多次调用 provider。** 单个 Turn 的
  Tool loop / compaction 会触发多次模型调用，只放 1 条 response 会在后续调用报
  `No more faux responses queued`。多 turn / 幂等测试要铺 `Array(40).fill(answer)`，
  避免队列耗尽导致误报 503。
- **集成测试绝不能 `$disconnect()` 共享的 `getPrisma()` 单例。**
  `tooling/run-api-integration-tests.mjs` 的 `cleanupTestUser` 复用同一个 Prisma
  客户端的连接池并负责删除测试用户；在测试内 disconnect 会让后续清理 `ECONNREFUSED`。
  harness 拥有客户端生命周期，测试只做查询、不关连接。
- **Agent 故障语义**：模型失败 → `AiTurn.status=failed` + `errorCode` 保留，
  HTTP 503；租约内重复 `clientRequestId` → 409 `conflict`；成功后重复
  `clientRequestId` + 相同内容 → 返回缓存、不重复 `AiUsageEvent`。
- **已知 flaky**：`tests/integration/clips-api.test.mjs` 的
  `concurrent refreshes allow only one active lease` 是时序敏感测试（250ms fetch 租约窗
  vs 50ms sleep），node test runner 默认并行跑文件，负载下偶发 `[200,200]` 而非
  `[200,409]`。与 Agent 无关、可重跑通过；未在本工作包改动以避开越界。
- **独立跑单个 integration 测试文件时**：仓库根 `node_modules` 没有 `@mewmo/*`
  工作区软链，必须用相对路径导入工作区包（如 `../../packages/ai/src/index.ts`）；
  在 harness 的 `pnpm test:integration` 里因各包自带软链则可直接用包名。

