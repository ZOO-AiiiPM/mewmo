# ZOO-102 本地验收证据（sanitized）

> 本文件记录 ZOO-102 本地 Docker Agent 验收中可复现的 sanitized 证据。**不含任何凭据值**：未落盘 `DEEPSEEK_API_KEY` / `AGENT_IDENTITY_SECRET` / `DATABASE_URL` 的实际值，也未落盘真实 user/chat/host 标识。
>
> **安全更正记录（2026-08-01）**：
> 1. 首轮注入的 `DATABASE_URL` 曾指向**远端 Neon**；在真实鉴权冒烟**之前**即检测到，立即停止，**未对远端 DB 发任何鉴权 Agent 请求**（/v1/chats/* 均未调用）。
> 2. orchestrator 已更正 `deploy/agent/.env.agent`，`DATABASE_URL` 改为**专用本地 Docker PostgreSQL**（`127.0.0.1:55432`，库 `mewmo_zoo102`）、加 `REDIS_URL` 指向本地 Redis（`127.0.0.1:56379`）。
> 3. 每次 DB 命令前机械校验 `hostname=127.0.0.1 && port=55432`（不打印凭据）通过后执行。后续全部操作落在**本地隔离库**，成功完成真实冒烟。

## 1. 环境与配置事实（更正后）

- 本地 Agent 配置文件路径 `deploy/agent/.env.agent`：权限 `600`（`-rw-------`），被 gitignore 覆盖（`git check-ignore` 命中 `.gitignore:44`），`git status` 保持 untracked。
- `DATABASE_URL` 机械校验：**host=127.0.0.1, port=55432**（PASS），库 `mewmo_zoo102`。
- `REDIS_URL` 指向 127.0.0.1:56379（本地 Docker Redis；此前 `docker ps` 只读确认容器运行）。
- 配置文件 key 集合（值一律 redacted）：含 Agent 运行必需（identity、host/port、Langfuse development）、DeepSeek 变量（`AI_PROVIDER`/`AI_MODEL_AGENT_CHAT`/`AI_MODEL_DEEP_INSIGHT`/`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`）；**不含** Workflow 模型变量。
- 运行 Agent 进程 env 指示：`AI_PROVIDER=deepseek`、`AI_MODEL_AGENT_CHAT=deepseek-chat`、`AI_MODEL_DEEP_INSIGHT=deepseek-chat`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`NODE_ENV=development`、`AGENT_HOST=127.0.0.1`、`AGENT_PORT=3101`。

## 2. 非破坏性前置检查

- `docker ps` 只读：本机 PostgreSQL/Redis 容器均 Up。**未停止/重建/删除任何既有容器**。
- 端口：3101 启动前空闲；进程停止后确认释放。55432/56379 由 docker 代理监听确认。
- 只读连通：对**本地** `mewmo_zoo102` `SELECT current_database()` 成功返回 `mewmo_zoo102`。
- Redis 只读 `PING`：`PONG`。

## 3. 依赖 / Prisma / Migration（针对本地隔离库）

- `pnpm install`：成功（复用 store 缓存）；`package.json` / `pnpm-lock.yaml` 无改动。
- `pnpm db:generate`（`prisma generate`）：成功，生成 Prisma Client v7.8.0。
- `pnpm db:migrate:deploy`（**对本地 127.0.0.1:55432/mewmo_zoo102**）：3 个 migration 全部应用成功（init / reconcile / fix_default_agent_sessions）。
- `pnpm db:migrate:status`：**"Database schema is up to date!"**（库 `mewmo_zoo102`）。未 push、未 deploy 到非本地库。
- 注：此前远端 Neon 只读检查记录仅作事实留档，非验收依据；**本地隔离库才是本次验收真源**。

## 4. 启动与 `/health`

- 启动：`set -a; source deploy/agent/.env.agent; set +a; pnpm --filter @mewmo/agent start`。
- 监听 `127.0.0.1:3101`；`/health` → HTTP 200 `{"ok":true}`。
- 冒烟完成后精确 kill 监听 PID，3101 释放。

## 5. 鉴权真实 Agent 冒烟（本地库，成功 ✅）

- 在本地隔离库 `mewmo_zoo102` 注入最小测试 user + 空演示 chat（明确 test 标识，非真实用户数据）。
- 用合法 HS256 短期 identity token（secret 来自 env 不落盘，issuer/audience 默认）`POST /v1/chats/{demoChat}/stream`（SSE），内容为简短中文问候。
- 结果 **HTTP 200**；SSE 事件序列含 `turn.started` → 多个 `assistant.text.delta` → `turn.completed` / `result`。
- 本地库收到 1 个 `ai_turn`（写库成功），`ai_usage_events` 记录：
  - `provider=primary`（Runtime 单一 primary provider 名；实际 provider = deepseek，见进程 env）
  - `requested_model=deepseek-chat`（与配置一致）
  - `response_model=<deepseek 官方实际服务模型>`（官方服务端返回）
  - `input_tokens=2437`、`output_tokens=8`、`reasoning_tokens=0`（真实推断）

## 6. 验收对照

| 验收项 | 结果 |
|--------|------|
| Agent 本地环境使用 DeepSeek 官方付费 API | ✅ 满足：`AI_PROVIDER=deepseek` + 官方 base URL + `deepseek-chat`；真实请求 `requested_model=deepseek-chat` 写入本地 usage 事件 |
| Workflow 环境/模型配置无 diff | ✅ 满足：`deploy/worker/.env.worker` 未触碰，Agent env 无 Workflow 模型变量，`git status` 无相关 diff |
| PostgreSQL/Redis 前置检查通过，Agent `/health` 可访问 | ✅ 满足：本地只读检查通过，`/health` HTTP 200 `{"ok":true}` |
| 至少一次真实 Agent 请求可验证结果 | ✅ 满足：本地库拿到 1 个 ai_turn + usage 事件（`requested_model=deepseek-chat`） |
| 配置文件均被 gitignore，Git diff 不含凭据 | ✅ 满足：env untracked，任务文档只含 key 名/占位符，`git status` 干净 |

## 7. Blockers / 备注

- **无 blocker**：本地隔离库上全部达成。
- 备注：本地库 `mewmo_zoo102` 仅含为冒烟注入的 test user/chat，无生产/真实用户数据。
