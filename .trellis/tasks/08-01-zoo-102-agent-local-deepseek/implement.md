# ZOO-102 执行计划

> 本任务的 review gate（Phase 1.4 前置激活门槛）：`prd.md`、`design.md`、`implement.md` 完成且通过复核——符合复杂任务定义后才 `task.py start`。执行期间所有输出一律 sanitize，凭据值绝不打印/落盘。

## 阶段 A — 前置只读检查

- [x] A1. 复核本机 Docker 容器（只读）：`docker ps`，确认 PostgreSQL/Redis 存在且运行，不 stop/rm/recreate。
- [x] A2. 确认目标 `AGENT_PORT` 空闲；若被占，记录占用情况并换用空闲端口（不改 `.env.agent`，以运行时注入覆盖）。3101 空闲。
- [x] A3. 用 env 内 `DATABASE_URL` 做只读连通验证。**第一轮 URL 指向远端 Neon（已如实记录且未发鉴权请求）；orchestrator 更正后为本地 Docker PG（127.0.0.1:55432/mewmo_zoo102），机械校验 PASS 后只读连通成功**。
- [x] A4. 确认 `deploy/agent/.env.agent` 权限 600 且被 gitignore（`git check-ignore -v`）；仅核对 key 名集合，确认无 Workflow 模型变量。

## 阶段 B — 依赖与 Prisma

- [x] B1. `pnpm install`（根目录）安装依赖，保持锁文件/package.json 无 app 级不必要改动。
- [x] B2. `pnpm db:generate`（`prisma generate`）生成 Prisma client。
- [x] B3. `pnpm db:migrate:deploy` + `db:migrate:status`：对**本地** `127.0.0.1:55432/mewmo_zoo102` 应用 3 个 migration 成功，status **"Database schema is up to date!"**。

## 阶段 C — 启动 Agent 并验证 /health

- [x] C1. 后台启动：`set -a; source deploy/agent/.env.agent; set +a; pnpm --filter @mewmo/agent start`（记录 PID、端口；进程后台化）。
- [x] C2. `curl -fsS http://127.0.0.1:<port>/health` → HTTP 200，body `{"ok":true}`。
- [x] C3. 冒烟后停止 Agent（精确 PID）：端口 3101 释放、无残留进程。

## 阶段 D — 鉴权真实冒烟（✅ 本地库成功）

- [x] D0. **前置安全闸（通过）**：`DATABASE_URL` 机械校验 host=127.0.0.1 & port=55432（本地 Docker PG）后放行。第一轮远端 Neon 时未通过 → 未发鉴权请求并停止（见前）。
- [x] D1. 用 `signIdentityForTest`/等价 HS256 签短期 token（密钥取自 env，不打印）。
- [x] D2. `POST /v1/chats/{demoChat}/stream`（SSE），带 `Authorization: Bearer <token>` → **HTTP 200**，事件含 `turn.started`→`assistant.text.delta`→`turn.completed`/`result`。
- [x] D3. 本地库确认 1 个 `ai_turn` + usage（`requested_model=deepseek-chat`）；记录 sanitized 证据。
- [x] D4. 无前置不满足；无 blocker。

## 阶段 E — 收尾与证据落库

- [x] E1. 停止 Agent 进程（精确 PID）。**已完成。**
- [x] E2. 在 `lesson.md`/`research/` 写入 sanitized 证据与 blockers（含"远端 Neon→本地 Docker"更正 + 本地冒烟成功证据）。
- [x] E3. `git status --porcelain` 复核：仅任务文档变更，且无任何凭据值入 diff。
- [x] E4. 提交本任务 `.trellis/tasks/<task>/` 文档变更（tracked），env 保持 untracked。
- [ ] E5. **停止，交给 orchestrator 复核**（不 push、不 merge、不部署 Production）。

## 回滚点

- C1 启动失败或 Agent 崩溃 → 回 A 复核依赖/DB/端口。
- **D0 安全闸：DB 非本地（指向远端）→ 不发鉴权请求，记录 blocker 等待本地 DB 注入。**
- D 冒烟受 blocker 阻断 → 记录 blocker 作为验收结论，走 E 收尾。
- 任何意外改动 → `git restore` 还原后重验。
