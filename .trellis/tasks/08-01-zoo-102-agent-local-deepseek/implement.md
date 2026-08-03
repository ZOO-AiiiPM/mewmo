# ZOO-102 执行计划

> 本任务的 review gate（Phase 1.4 前置激活门槛）：`prd.md`、`design.md`、`implement.md` 完成且通过复核——符合复杂任务定义后才 `task.py start`。ZOO-112 最新视觉/历史契约已重新进入规划审查；用户再次批准本版计划前，不执行剩余产品代码。执行期间所有输出一律 sanitize，凭据值绝不打印/落盘。

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
- [x] D3. 首轮历史冒烟记录了错误的 `requested_model=deepseek-chat`；最终验收必须以修正后的 `requested_model=deepseek-v4-flash` 为准。
- [x] D4. 无前置不满足；无 blocker。

## 阶段 E — 收尾与证据落库

- [x] E1. 停止 Agent 进程（精确 PID）。**已完成。**
- [x] E2. 在 `lesson.md`/`research/` 写入 sanitized 证据与 blockers（含"远端 Neon→本地 Docker"更正 + 本地冒烟成功证据）。
- [x] E3. `git status --porcelain` 复核：仅任务文档变更，且无任何凭据值入 diff。
- [x] E4. 提交本任务 `.trellis/tasks/<task>/` 文档变更（tracked），env 保持 untracked。
- [ ] E5. **停止，交给 orchestrator 复核**（不 push、不 merge、不部署 Production）。

## 阶段 F — ZOO-111 / ZOO-112 实现与自动验证

- [x] F1. DeepSeek Agent purposes 切换 Responses API；Workflow adapter/model 不变。
- [x] F2. Deep Thinking 改为持久开关，并固定 `low/high` 映射。
- [x] F3. 按最终契约重构为单层 turn 时间线：generation/reasoning/Tool 原序展示，final terminal 独立投影；移除 ToolGroup 聚合与 Tool 二级“查看详情”，详情直接使用 sanitized public projection。
- [x] F4. terminal settlement 覆盖 `turn.completed` 后 trailing transport error，保留 authoritative 完成态。
- [x] F5. Agent/Web/shared/AI focused tests、lint、TypeScript、theme 与 diff check。
- [x] F6. 恢复 Streaming Markdown 有序/无序列表 marker，并覆盖 `ul` / `ol` DOM 与 CSS `list-style-type` contract；真实 computed style 留在 G5 登录态浏览器验收。
- [x] F7. 深度思考开关与 reasoning block 使用 bulb；过程 summary 无 icon；新增最小 Tool 名称→Solar icon 映射，并让 Tool 完成后保留语义 icon。
- [x] F8. 实现过程 summary 状态机：caret 固定最左，streaming 默认展开且尊重手动折叠，completed 自动折叠并显示总耗时，failed/stopped 保持展开并显示对应状态。
- [x] F9. 持久化 Turn 的 high/low、时间边界及安全 process projection；历史 API 按 `entrySeq` 投射同一 Turn 的全部 blocks，刷新/切换后恢复 high reasoning 与 Tool 详情并继续隐藏 low reasoning。
- [x] F10. 为相邻 block 分段、terminal reconciliation、四类折叠状态、Tool 语义 icon、历史 high/low/Tool projection 与列表 marker 添加最小 regression，随后重跑 focused tests、lint、TypeScript、theme 与 diff check。

## 阶段 G — 真实验收

- [x] G1. 未修改 Pi adapter，Agent 直接请求 `deepseek-v4-flash`；真实 high 请求 HTTP 200、收到独立 reasoning stream 与 `turn.completed`，本地 usage 的 `requested_model=deepseek-v4-flash`。
- [x] G2. Langfuse development generation 显示 `reasoning.effort=low|high`，high reasoning usage 非 0，low 为 0 允许。
- [x] G3. 真实 tool-call 时间线、连续 10 轮 bounded soak 与 ZOO-111 无卡死验收：10/10 HTTP 200、10/10 `turn.completed`，均 clean EOF。
- [x] G4. localhost Web 非视觉行为验收：连续两轮 high 后 toggle 保持开启；每轮过程区与 final 为独立兄弟节点；第二轮完成后输入框恢复可用。
- [ ] G5. localhost Web 视觉验收：深浅主题、bulb 与 Tool Solar icon、左侧 caret、过程区单层详情及四类状态由用户验收。
- [ ] G5a. 修复 assistant 后置 flex override 导致的 shrink-to-content，确认 summary 与 final 首字共用内容列左边界；禁止标题局部偏移补丁。
- [ ] G5b. 统一过程 generation/reasoning/Tool 的 `12px`、行高与常态灰度；reasoning 显示 bulb + “深度思考中 / 思考过程”，正文引用线及缩进只属于 reasoning。
- [ ] G5c. final 与过程之间仅在存在 final 时显示内容列分割线；真实浏览器确认过程与 final 的有序、无序、嵌套列表 marker。
- [ ] G6. localhost 历史恢复验收：completed 默认折叠；展开后 high reasoning、generation、Tool public details 与 final 分层完整；low Turn 不暴露 reasoning；缺时间不伪造耗时。
- [ ] G7. 确认当前 worktree 不包含 ZOO-128 citation 实现；ZOO-128 保持 Backlog，等待独立 AO execution unit。

## 回滚点

- C1 启动失败或 Agent 崩溃 → 回 A 复核依赖/DB/端口。
- **D0 安全闸：DB 非本地（指向远端）→ 不发鉴权请求，记录 blocker 等待本地 DB 注入。**
- D 冒烟受 blocker 阻断 → 记录 blocker 作为验收结论，走 E 收尾。
- 任何意外改动 → `git restore` 还原后重验。
