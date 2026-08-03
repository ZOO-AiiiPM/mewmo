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
- 运行 Agent 进程 env 指示：`AI_PROVIDER=deepseek`、`AI_MODEL_AGENT_CHAT=deepseek-v4-flash`、`AI_MODEL_DEEP_INSIGHT=deepseek-v4-flash`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`NODE_ENV=development`、`AGENT_HOST=127.0.0.1`。

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
- 首轮历史冒烟使用了错误的 `deepseek-chat` 配置；该记录只保留为纠错历史，不作为最终模型验收依据。
- 修正后未修改 Pi adapter，真实 high 请求 HTTP 200，SSE 包含 reasoning delta 与 `turn.completed`；最新 `ai_usage_events` 记录：
  - `provider=primary`（Runtime 单一 primary provider 名；实际 provider = deepseek，见进程 env）
  - `requested_model=deepseek-v4-flash`
  - `response_model=null`（请求已使用真实 model id，不依赖 adapter 改写响应模型）
  - `reasoning_tokens=24`
- Langfuse observation `1781d89537fad031`：`model=deepseek-v4-flash`、`reasoning.effort=high`、reasoning usage 24。

## 6. 验收对照

| 验收项 | 结果 |
|--------|------|
| Agent 本地环境使用 DeepSeek 官方付费 API | ✅ 满足：`AI_PROVIDER=deepseek` + 官方 base URL；Agent 直接请求 `deepseek-v4-flash`，未修改 Pi adapter |
| Workflow 环境/模型配置无 diff | ✅ 满足：`deploy/worker/.env.worker` 未触碰，Agent env 无 Workflow 模型变量，`git status` 无相关 diff |
| PostgreSQL/Redis 前置检查通过，Agent `/health` 可访问 | ✅ 满足：本地只读检查通过，`/health` HTTP 200 `{"ok":true}` |
| 至少一次真实 Agent 请求可验证结果 | ✅ 满足：真实 high SSE 完成，本地 usage 与 Langfuse 均记录 `deepseek-v4-flash` |
| 配置文件均被 gitignore，Git diff 不含凭据 | ✅ 满足：env untracked，任务文档只含 key 名/占位符，`git status` 干净 |

## 7. Blockers / 备注

- **无 blocker**：本地隔离库上全部达成。
- 备注：本地库 `mewmo_zoo102` 仅含为冒烟注入的 test user/chat，无生产/真实用户数据。

## 8. ZOO-112 自动验证（2026-08-03）

- Focused Vitest：`pnpm exec vitest run apps/agent/src/server.test.ts apps/agent/src/pi/runtime.test.ts apps/agent/src/pi/tool-event-display.test.ts apps/agent/src/automation/run-batch.test.ts apps/web/src/components/agent/AssistantRow.test.tsx apps/web/src/components/agent/ChatInput.test.ts apps/web/src/lib/agent/assistant-presentation.test.ts apps/web/src/lib/agent/transcript-adapter.test.ts apps/web/src/lib/agent/conversation-stream-lifecycle.test.ts packages/application/src/ai-session-service.test.ts packages/db/src/repositories/ai-chats.test.ts packages/shared/src/agent-events.test.ts tests/unit/shared-note-markdown.test.ts` → **13 files / 91 tests passed**。新增 regression 覆盖 low omitted/false 不发 stable 或 legacy reasoning SSE、high 仍发两种事件，以及 runtime/legacy/stable/history 的 Tool start + result details 保序去重合并（最多 8 条）。
- Web lint：`pnpm --filter @mewmo/web lint` → passed。
- TypeScript：`pnpm exec tsc --noEmit -p apps/web/tsconfig.json`、`apps/agent/tsconfig.json`、`packages/application/tsconfig.json`、`packages/shared/tsconfig.json`、`packages/db/tsconfig.json` → 全部 passed。
- Theme：`pnpm test:theme` → passed。
- Diff：`git diff --check && git diff --cached --check` → passed。
- Scope/safety audit：无 `deploy/worker`、Prisma schema 或 ZOO-128 产品实现 diff；未发现凭据赋值进入 diff。
- Tool icon source：`magnifer-linear` / `sledgehammer-linear` 已按 Iconify Solar API 返回的官方 SVG path 本地内联；未新增依赖或外部运行时资源。
- Localhost：复用同 worktree 既有 `http://localhost:3100`，HTTP 200；in-app browser 可加载公开首页，但没有登录态，无法进入 Agent transcript。G5/G6 仍需在登录态浏览器完成深浅主题、computed list marker、图标/折叠与刷新历史验收，未标记为通过。
