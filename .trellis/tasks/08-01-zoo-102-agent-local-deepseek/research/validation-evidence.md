# ZOO-102 本地验收证据（sanitized）

> 本文件记录 ZOO-102 本地 Docker Agent 验收中可复现的 sanitized 证据。**不含任何凭据值**：未落盘 `DEEPSEEK_API_KEY` / `AGENT_IDENTITY_SECRET` / `DATABASE_URL` 的实际值，也未落盘真实 user/chat/Neon 标识。

## 1. 环境与配置事实

- 本地 Agent 配置文件路径 `deploy/agent/.env.agent`：权限 `600`（`-rw-------`），被 gitignore 覆盖（`git check-ignore` 命中 `.gitignore:44`），`git status` 保持 untracked。
- 配置文件 key 集合（值一律 redacted，仅核对 key 名）：含 Agent 运行必需变量（identity、host/port、Langfuse development tracing）+ DeepSeek 变量（`AI_PROVIDER`、`AI_MODEL_AGENT_CHAT`、`AI_MODEL_DEEP_INSIGHT`、`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`）；**不含** Workflow 模型变量（`AI_MODEL_RECOMMENDATION`/`AI_MODEL_NOTE_INSIGHT`/`AI_MODEL_SUMMARY`/`AI_MODEL_EMBEDDING` 等）。
- 运行 Agent 进程的环境指示：`AI_PROVIDER=deepseek`、`AI_MODEL_AGENT_CHAT=deepseek-chat`、`AI_MODEL_DEEP_INSIGHT=deepseek-chat`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`NODE_ENV=development`、`LANGFUSE_ENVIRONMENT=development`、`AGENT_HOST=127.0.0.1`、`AGENT_PORT=3101`。

## 2. 非破坏性前置检查（Docker / 端口 / DB / Redis）

- `docker ps` 只读列出本机运行中的 PostgreSQL 与 Redis 容器，均 Up（未停止/重建/删除任何容器）。
- 端口：启动前目标端口 3101 空闲（`lsof` 无监听）；停止进程后再次确认 3101 释放。
- DB 连通（只读 `SELECT 1` 成功）：连通正常，服务端为 PostgreSQL（版本于验证时报告为 18.x）。
- Redis（本机容器只读 `PING`）：返回 `PONG`。
- **发现（重要）**：本任务 orchestrator 注入的本地 Agent `DATABASE_URL` 指向 **Neon**（`*.aws.neon.tech`，db `neondb`），并非本地 Docker PostgreSQL 实例。本次验收严格按所给本地 env 指向的 DB 执行只读连通与 migration 检查；本地 Docker PostgreSQL 仅通过 `docker ps` 只读确认存在。

## 3. 依赖 / Prisma / Migration

- `pnpm install`：成功（复用 store 缓存，18 workspace 项目）。`package.json` / `pnpm-lock.yaml` 无改动（`git status` 干净除任务目录）。
- `pnpm db:generate`（`prisma generate`）：成功，约 195ms 生成 Prisma Client v7.8.0。
- `pnpm db:migrate:status`（`prisma migrate status`）：**"Database schema is up to date!"**，3 个 migration 目录（init / reconcile / fix_default_agent_sessions），目标 DB `neondb` schema `public` 无 drift。未执行 push/deploy。

## 4. 启动与 `/health`

- 启动命令：以 env 注入方式（`set -a; source deploy/agent/.env.agent; set +a`）跑 `pnpm --filter @mewmo/agent start`，后台运行。
- 监听：`127.0.0.1:3101`（确认 node PID 与端口）。
- `/health`：`curl -fsS http://127.0.0.1:3101/health` → HTTP 200，body `{"ok":true}`。
- 结束后精确 kill 监听 PID，端口 3101 释放，进程退出正常。

## 5. 鉴权真实 Agent 冒烟

- 用合法 HS256 身份 token（本地用与 Web BFF 相同的 identity secret 按 issuer `mewmo-web` / audience `mewmo-agent` 签发，short-lived）向 `POST /v1/chats/{chatId}/messages` 发起一次真实请求（请求一个演示用空会话 chat，内容为简短中文问候）。
- 结果：**HTTP 200**，返回 user + assistant 两条消息，assistant 文本为中文问候回复。
- 服务端持久化的 `ai_usage_events` 记录了该次真实调用（读本次请求的 usage 事件，避免读取既有用户数据）：
  - `provider=primary`（Runtime 对单一配置 provider 的内部名；该 provider 经运行进程 env 确认为 `deepseek`）
  - `requested_model=deepseek-chat`（与 `AI_MODEL_AGENT_CHAT` 一致）
  - `response_model=<deepseek 官方实际服务模型>`（官方服务端返回；请求模型为 deepseek-chat）
  - 记录 `input_tokens` / `output_tokens`（真实发生推断）
  - `reasoning_tokens=0`

> 说明：`provider=primary` 是 `packages/ai/src/runtime/env.ts` 硬编码的单一 provider 名，不代表 provider 是 "primary"；真正 provider 由 `AI_PROVIDER` 决定，本任务已确认为 `deepseek`，且 `requested_model=deepseek-chat` 证实走的是 DeepSeek 官方 chat 模型。

## 6. 验收对照

| 验收项 | 结果 |
|--------|------|
| Agent 本地环境使用 DeepSeek 官方付费 API | ✅ 满足：`AI_PROVIDER=deepseek` + 官方 base URL + `deepseek-chat`；真实请求 `requested_model=deepseek-chat` |
| Workflow 环境/模型配置无 diff | ✅ 满足：`deploy/worker/.env.worker` 未触碰，本地 Agent env 无 Workflow 模型变量，`git status` 无相关 diff |
| PostgreSQL/Redis 前置检查通过，Agent `/health` 可访问 | ✅ 满足：只读检查通过，`/health` HTTP 200 `{"ok":true}` |
| 至少一次真实 Agent 请求可验证结果 | ✅ 满足：HTTP 200 + usage 事件证实真实调用 |
| 配置文件均被 gitignore，Git diff 不含凭据 | ✅ 满足：env untracked，任务文档只含 key 名/占位符，`git status` 除任务目录外干净 |

## 7. Blockers / 备注

- **无 blocker**：全部前置与冒烟达成。
- 备注 A：本地 Agent `DATABASE_URL` 指向 Neon 而非本地 Docker PG（见上）。请在交付评估时确认该本地 env 的 DB 指向是否符合预期（是否应改用本地 Docker PG）。
- 备注 B：`response_model` 由 DeepSeek 官方服务端返回，可能与请求模型名不同属正常（官方路由）；验收以 `requested_model=deepseek-chat` + `AI_PROVIDER=deepseek` 为准。
