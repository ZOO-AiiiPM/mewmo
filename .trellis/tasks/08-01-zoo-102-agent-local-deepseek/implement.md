# ZOO-102 执行计划

> 本任务的 review gate（Phase 1.4 前置激活门槛）：`prd.md`、`design.md`、`implement.md` 完成且通过复核——符合复杂任务定义后才 `task.py start`。执行期间所有输出一律 sanitize，凭据值绝不打印/落盘。

## 阶段 A — 前置只读检查

- [ ] A1. 复核本机 Docker 容器（只读）：`docker ps`，确认 PostgreSQL/Redis 存在且运行，不 stop/rm/recreate。
- [ ] A2. 确认目标 `AGENT_PORT` 空闲；若被占，记录占用情况并换用空闲端口（不改 `.env.agent`，以运行时注入覆盖）。
- [ ] A3. 用 env 内 `DATABASE_URL` 做只读连通验证（不打印连接串）。
- [ ] A4. 确认 `deploy/agent/.env.agent` 权限 600 且被 gitignore（`git check-ignore -v`）；仅核对 key 名集合，确认无 Workflow 模型变量。

## 阶段 B — 依赖与 Prisma

- [ ] B1. `pnpm install`（根目录）安装依赖，保持锁文件/package.json 无 app 级不必要改动。
- [ ] B2. `pnpm db:generate`（`prisma generate`）生成 Prisma client。
- [ ] B3. `pnpm db:migrate:status`（`prisma migrate status`）记录只读 migration 状态。

## 阶段 C — 启动 Agent 并验证 /health

- [ ] C1. 后台启动：`set -a; source deploy/agent/.env.agent; set +a; pnpm --filter @mewmo/agent start`（记录 PID、端口；进程后台化）。
- [ ] C2. `curl -fsS http://127.0.0.1:<port>/health` → 期望 `{ ok: true }`，状态 200。

## 阶段 D — 鉴权真实冒烟

- [ ] D1. 用 `signIdentityForTest`/等价 HS256 签短期 token（密钥取自 env，不打印）。
- [ ] D2. `POST /v1/chats/:chatId/stream`（或 `/messages`），带 `Authorization: Bearer <token>`；观察 SSE 事件 / JSON 响应。
- [ ] D3. 确认 usage/provider/model 指向 deepseek 官方；记录 sanitized 证据。
- [ ] D4. 若任何前置不满足 → 记录精确 blocker 与失败证据，不臆造通过。

## 阶段 E — 收尾与证据落库

- [ ] E1. 停止 Agent 进程（精确 PID）。
- [ ] E2. 在 `lesson.md`/`research/` 写入 sanitized 证据与 blockers。
- [ ] E3. `git status --porcelain` 复核：仅任务文档变更，且无任何凭据值入 diff。
- [ ] E4. 提交本任务 `.trellis/tasks/<task>/` 文档变更（tracked），env 保持 untracked。
- [ ] E5. **停止，交给 orchestrator 复核**（不 push、不 merge、不部署 Production）。

## 回滚点

- C1 启动失败或 Agent 崩溃 → 回 A 复核依赖/DB/端口。
- D 冒烟受 blocker 阻断 → 记录 blocker 作为验收结论，走 E 收尾。
- 任何意外改动 → `git restore` 还原后重验。
