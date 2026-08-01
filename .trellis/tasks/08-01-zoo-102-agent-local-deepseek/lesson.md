# Lessons: ZOO-102 Agent 本地 Docker 验收：DeepSeek 官方模型（不影响 Workflows）

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## 结论

- **验收通过（本地隔离环境）**：Agent 本地环境使用 DeepSeek 官方付费 API（`AI_PROVIDER=deepseek`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`AI_MODEL_AGENT_CHAT=deepseek-chat`），`/health` HTTP 200 `{"ok":true}`；对**本地 Docker PG（127.0.0.1:55432/mewmo_zoo102）**执行 migration deploy/status 成功，并完成一次**真实鉴权 Agent SSE 冒烟**（HTTP 200，本地库记录 1 个 ai_turn + usage，`requested_model=deepseek-chat`）。Workflow provider/model 与 `deploy/worker/.env.worker` 零改动。**无 blocker。**
- 首轮 env 曾指向远端 Neon，已在冒烟前识别并按安全指令停止，未发鉴权请求；orchestrator 更正为专用本地 Docker DB 后重跑成功。
- 完整 sanitized 证据见 `research/validation-evidence.md`。

## 观察 / 踩坑（待 curation）

1. **Agent 本地 `DATABASE_URL` 必须先确认指向本地 Docker PG 再冒烟**：识别 host/port（本地 `127.0.0.1:<自定义端口>`；远端 Neon `*.neon.tech`）。若指向远端，**严禁发鉴权 Agent 请求**，只允许只读连通/迁移检查并记录 blocker。每次 DB 命令前机械校验 host=127.0.0.1 & port=<固定本地端口>，不打印凭据。
2. **`unknown` key 必须复核**：env 新增 `AGENT_CHAT_THINKING_LEVEL=low`，已在 `apps/agent/src/config.ts` envSchema 确认为合法枚举。
3. **auth**：除 `/health` 外所有路由要 HS256 identity token（sub/sid/source=web_bff，issuer/audience 默认）。本地冒烟用 `signIdentityForTest` 同参数短期 token 即可。
4. **真实冒烟数据前提**：`POST /v1/chats/:chatId/*` 要求 chat 存在且属该 user（`requireOwnedChat` 查 `ai_chats`）。隔离库为空时需注入最小 test user + demo chat（显式 test 标识）；不读/写真实用户数据。这是本地隔离库验收的合法种子，不影响生产。
5. **`provider=primary` 不代表 provider 是 primary**：`packages/ai/src/runtime/env.ts` 把单一 provider 硬编码叫 `primary`；真正 provider 看 `AI_PROVIDER`。
6. **Prisma SQL 字段**：usage 表列为 `requested_model`/`response_model`（snake_case）。
7. **monorepo 约定（复用 gotchas）**：`pnpm install` 必须在根目录。
8. **进程清理纪律**：启动/停止必须精确 PID；停止后复核端口释放、无残留 `tsx src/index.ts` 进程。
