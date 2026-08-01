# ZOO-102 技术设计

## 1. 边界与事实

| 元素 | 位置 / 值 | 说明 |
|------|-----------|------|
| Agent 服务入口 | `apps/agent/src/index.ts` | 读 `loadAgentConfig()`，绑定 `AGENT_HOST`/`AGENT_PORT`，`/health` 无需鉴权 |
| AI provider 装配 | `packages/ai/src/runtime/env.ts` | `AI_PROVIDER=deepseek` → `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`（缺省官方 URL），`useBuiltinProvider=true` |
| Agent 模型 purpose | env.ts `purposes` | `agent.chat` ← `AI_MODEL_AGENT_CHAT`；`agent.deep_insight` ← `AI_MODEL_DEEP_INSIGHT`（fallback 到 chat） |
| Agent 配置校验 | `apps/agent/src/config.ts` | `AGENT_IDENTITY_SECRET.min(32)` 等；`AGENT_CHAT_THINKING_LEVEL` 合法枚举 |
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
  - `AI_MODEL_AGENT_CHAT=deepseek-chat`、`AI_MODEL_DEEP_INSIGHT=<deep insight 模型>`
- 其余为 Agent 运行必需的身份/边界变量（`AGENT_IDENTITY_SECRET`、`AGENT_HOST=127.0.0.1`、`AGENT_PORT` 可用端口、Langfuse development tracing 之类）。
- **不做**：不写 Workflow 相关模型变量到该文件；不改 `deploy/worker/*`；不改 Workflow provider/model。

## 3. 依赖与 Prisma

- `pnpm install`（根目录，Turborepo 工作区；node/空 node_modules）。用 `--frozen-lockfile` 或按需 `--offline` fallback，目标是最小改动、只装依赖不改锁文件。
- `pnpm db:generate`（`prisma generate`）生成 Prisma client，供 `apps/agent` 经 `@mewmo/db` 使用。
- `pnpm db:migrate:status`（`prisma migrate status`）只读查询 migration 状态；不做 push/deploy（本地只读验证，非建库）。

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
- Git：只提交本任务 `.trellis/tasks/<task>/` 文档变更；env 文件保持 untracked（gitignore 已覆盖）。确认最终 `git status` 无凭据。

## 8. 回滚

- 停止 Agent 进程（精确 PID）；恢复默认无需改动（不触碰部署文件）；若无意改了任务文档以外内容，`git restore` 还原并复核。
