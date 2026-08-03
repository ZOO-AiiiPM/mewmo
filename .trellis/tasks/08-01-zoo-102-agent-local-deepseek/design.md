# ZOO-102 技术设计

## 1. 边界与事实

| 元素 | 位置 / 值 | 说明 |
|------|-----------|------|
| Agent 服务入口 | `apps/agent/src/index.ts` | 读 `loadAgentConfig()`，绑定 `AGENT_HOST`/`AGENT_PORT`，`/health` 无需鉴权 |
| AI provider 装配 | `packages/ai/src/runtime/env.ts` | `AI_PROVIDER=deepseek` → `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`（缺省官方 URL），`useBuiltinProvider=true` |
| Agent 模型 purpose | env.ts `purposes` | `agent.chat` ← `AI_MODEL_AGENT_CHAT`；`agent.deep_insight` ← `AI_MODEL_DEEP_INSIGHT`（fallback 到 chat） |
| Agent 配置校验 | `apps/agent/src/config.ts` | `AGENT_IDENTITY_SECRET.min(32)` 等；思考档位由请求 `thinking` 映射为 `low/high` |
| 鉴权 | `apps/agent/src/identity.ts` | HS256 JWT，issuer `mewmo-web`，audience `mewmo-agent`；`signIdentityForTest` 签发测试 token |
| 路由 | `apps/agent/src/server.ts` | `/health` 公开；`POST /v1/chats/:chatId/stream`（SSE）、`POST /v1/chats/:chatId/messages`（JSON）需 `Bearer` |
| 本地 env | `deploy/agent/.env.agent` | mode 600、gitignored；Agent process 专属，含 DeepSeek 凭据，无 Workflow 模型变量 |
| 数据库 | 本机 Docker PostgreSQL（运行中） | 只读复用；经 `DATABASE_URL` 指向，不重建/停止 |
| 缓存 | 本机 Docker Redis（运行中） | 按需只读验证连通性 |
| migration | `packages/db/prisma/migrations/` | 现分支存在 3 个 migration 目录（init / reconcile / fix_default_agent_sessions） |

## 2. 本地 env 装配方案

- 本地 Agent 直接让 `packages/ai` 走 `deepseek` 原生 provider：
  - `AI_PROVIDER=deepseek`
  - `DEEPSEEK_API_KEY`：值由 orchestrator 注入到 gitignored env（本文件不记录值）
  - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
  - `AI_MODEL_AGENT_CHAT=deepseek-v4-flash`、`AI_MODEL_DEEP_INSIGHT=deepseek-v4-flash`
- 其余为 Agent 运行必需的身份/边界变量（`AGENT_IDENTITY_SECRET`、`AGENT_HOST=127.0.0.1`、`AGENT_PORT` 可用端口、Langfuse development tracing 之类）。
- **不做**：不写 Workflow 相关模型变量到该文件；不改 `deploy/worker/*`；不改 Workflow provider/model。

## 3. 依赖与 Prisma

- `pnpm install`（根目录，Turborepo 工作区；node/空 node_modules）。用 `--frozen-lockfile` 或按需 `--offline` fallback，目标是最小改动、只装依赖不改锁文件。
- `pnpm db:generate`（`prisma generate`）生成 Prisma client，供 `apps/agent` 经 `@mewmo/db` 使用。
- 对隔离本地库先执行 `pnpm db:migrate:deploy`，再用 `pnpm db:migrate:status` 只读复核；不得对远端或 Production 执行 migration deploy。

## 4. 非破坏性前置检查

- 端口：确认目标 `AGENT_PORT` 空闲或按需选空闲端口（严禁 kill 其他进程占用；被占则换空闲端口）。
- Docker：`docker ps`（只读）确认 PostgreSQL/Redis 容器存在且在运行；不 stop/rm/recreate。
- **DB 指向闸（关键）**：确认 Agent `DATABASE_URL` 指向**本地 Docker PostgreSQL**（`127.0.0.1:55432`，库 `mewmo_zoo102`），机械校验 host=127.0.0.1 && port=55432（不打印凭据）。若指向远端（Neon `*.neon.tech`），仅允许只读连通/迁移检查，**严禁对其实发鉴权 Agent 请求**，记录 blocker 并停止。首轮 env 曾指向远端 Neon → 已在冒烟前识别并停止；orchestrator 更正后放行。
- 数据库连通：用只读连接（连接串来自 env，不打印）做一次表层查询，验证可连。
- 迁移状态/部署：对本地隔离库执行 `prisma migrate deploy` + `migrate status`（只读复核）。

## 5. 启动与 `/health`

- 以 `set -a; source deploy/agent/.env.agent; set +a` 方式注入 env（不 xtrace），用 `pnpm --filter @mewmo/agent start` 启动后台进程。
- `curl -fsS http://127.0.0.1:<port>/health` 验证 `{ ok: true }`。
- 启动成功后记录 PID、端口；结束时清理进程（精确 PID）。

## 6. 鉴权冒烟

- **前置安全闸**：仅当 Agent `DATABASE_URL` 机械校验为本地 Docker PostgreSQL（`127.0.0.1:55432` / `mewmo_zoo102`）时，才进行鉴权冒烟。
- 用 `signIdentityForTest`（或等价的 jose HS256 本地签名，密钥来自 env 不落盘）签发短期 token（sub/sid/source=web_bff）。
- `POST /v1/chats/:chatId/stream`，body `{ content, clientRequestId }`，`Authorization: Bearer <token>`，观察 SSE 事件中的 `turn.completed` / `assistant.text.delta`，确认 provider 为 deepseek 且模型如配置。
- 若因密钥/DB/网络 blocker 无法完成真实请求，则记录精确、sanitized 的 blocker 与失败证据，不臆造结果。对远端库不给任何鉴权请求。

## 7. 证据与安全

- 所有证据 sanitize：不放 `DEEPSEEK_API_KEY`/`AGENT_IDENTITY_SECRET`/`DATABASE_URL` 实际值。
- 记录：`/health` 返回、首轮 SSE 事件（含 usage.provider/model）、migration status 概要、依赖安装/生成结果、端口与容器只读检查结果。
- Git：只提交 ZOO-102 及其 ZOO-111/ZOO-112 Sub-issue 范围内的产品代码、测试和任务文档；env 文件保持 gitignored。确认最终 diff 无凭据、无 ZOO-128 实现。

## 8. 回滚

- 停止 Agent 进程使用精确 PID。产品改动按阶段 F 的测试边界逐项回滚；任何范围外文件先备份 diff，再由主控决定恢复，禁止覆盖并行或用户改动。

## 9. ZOO-111 / ZOO-112 数据流设计

1. `ChatInput` 保留 `thinking` 状态，发送只读取它，不消费它；`skillId` 仍按既有发送生命周期处理。
2. `apps/agent` 将 false/omitted 映射为 Pi `low`、true 映射为 `high`；`packages/ai` 只为 Agent response purposes 注册 Responses adapter，Workflow purposes 继续原 adapter。
3. Pi reasoning/text/tool events 转换为带 `seq` 的稳定 SSE；Web accumulator 按原序追加 `AssistantBlock`，连续同类 delta 只合并相邻块，不跨 generation/Tool 重排。
4. Tool start/end 通过现有 allowlist formatter 生成 public projection。`ToolGroup` 聚合和 `ToolBlock` 二级 details 被移除，单个 Tool block 直接渲染语义 icon、状态及 public details。
5. Web settlement 以 `turn.completed` 为 authoritative terminal。terminal 到达后把最后一个正常结束的 text generation 投影为 final answer，其余块保持在 process timeline；这是本地状态归并，不重新请求或重载页面。
6. 过程折叠使用组件本地状态：首次 streaming 默认 open；用户切换后 streaming update 不覆盖；成功 terminal 自动 close；failed/stopped 保持 open。caret、状态文案和总耗时都在同一个左对齐 summary 中。
7. Turn duration 优先使用稳定 turn 的 started/completed 时间；实时期间用单调递增的本地 elapsed。历史只有边界完整时显示耗时，缺失时不估算。
8. Agent 配置直接请求 `deepseek-v4-flash`；Langfuse bridge记录 `reasoning.effort` 与 reasoning usage，不修改 Pi adapter。low reasoning 可持久化供 replay/observability 使用，但 Web projection 必须依据当轮 `thinking` 选择隐藏。
9. `AiSessionEntry.payload.message.content` 已保存 reasoning/text/tool entries。历史 API 按 `entrySeq` 输出同一 Turn 的安全 block projection，Web 不再从单条最终 `AiMessage.content` 猜过程；Turn 的 `thinking` 选择与时间边界写入现有 JSON，不改 Prisma schema。
10. Markdown 列表仅恢复现有 renderer 的 `disc`/`decimal` CSS。图标继续复用本地 `PrototypeIcon` 资产：过程标题无 icon，深度思考使用 bulb，Tool 按名称映射现有/新增的最少 Solar SVG，不增加图标依赖。
11. assistant 消息容器恢复整行 stretch，折叠 summary 与 final 共用内容列左边界；禁止为 summary 添加单独的 margin/transform 修补。外层过程区不画竖线，reasoning 自己的正文才画引用线并与 Tool details 共用缩进。
12. 过程排版统一使用现有语义色与 `12px` 字号；reasoning 标题由 turn 状态投影为“深度思考中 / 思考过程”。final 保持 `13.5px` 主文字色，并在存在 final 时由一条低对比度内容列分割线与过程区分开。
13. 列表继续使用现有 parser 输出的原生 `ul` / `ol` / `li`，在 `.mewmo-md` 范围恢复 marker；不手写圆点/数字，不新增 Markdown 依赖。浏览器验收同时覆盖过程 generation 与 final 的 ordered/unordered/nested marker。

## 10. 交付拆分

- ZOO-112 只交付 turn 时间线、状态、图标、terminal reconciliation 与历史恢复。
- ZOO-128 另行交付 citation source ID、快照、正文徽标、来源列表、Hover Preview 与跳转；待 ZOO-112 完成后从其结果基线启动，不在当前 worktree 实现。
