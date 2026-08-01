# Lessons: ZOO-102 Agent 本地 Docker 验收：DeepSeek 官方模型（不影响 Workflows）

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## 结论

- Agent 本地环境已明确使用 DeepSeek 官方付费 API（`AI_PROVIDER=deepseek`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`AI_MODEL_AGENT_CHAT=deepseek-chat`），`/health` 可访问，且完成一次真实鉴权 Agent 请求（HTTP 200，usage 事件记录 `requested_model=deepseek-chat`）。Workflow provider/model 与 `deploy/worker/.env.worker` 零改动。无 blocker。
- 完整 sanitized 证据见 `research/validation-evidence.md`。

## 观察 / 踩坑（待 curation）

1. **本地 Agent 的 `DATABASE_URL` 指向 Neon 而非本地 Docker PostgreSQL**。ZOO-102 目标写着"复用本机 Docker PostgreSQL/Redis"，但 orchestrator 注入的本地 env 指向 Neon。本次按所给 env 执行只读检查与 smoke；是否需要改用本地 Docker PG 需产品/编排确认。
2. **`unknown` key 必须复核**：env 新增了 `AGENT_CHAT_THINKING_LEVEL=low`，已在 `apps/agent/src/config.ts` envSchema 确认是合法枚举，非无关变量。
3. **auth**：除 `/health` 外所有路由要 HS256 identity token（`sub`/`sid`/`source=web_bff`，issuer/audience 默认 `mewmo-web`/`mewmo-agent`）。本地冒烟用 `signIdentityForTest` 同参数短期 token 即可。
4. **真实冒烟要求数据前提**：`POST /v1/chats/:chatId/*` 要求 chat 已存在且属该 user（`requireOwnedChat` 查 `ai_chats`）。本地冒烟需选一个真实 user 拥有的空演示 chat；务必用空会话并向 usage 事件回查 provider/model，避免读已有用户的敏感内容。
5. **`provider=primary` 不代表 provider 是 primary**：`packages/ai/src/runtime/env.ts` 把单一 provider 硬编码叫 `primary`；真正 provider 看 `AI_PROVIDER`，`ai_usage_events.provider` 落库为 `primary` 是 runtime 主 provider 名，需结合进程 env 解析。
6. **Prisma SQL 字段**：usage 表列是 `requested_model`/`response_model`（camelCase 被 map 成 snake_case）；直接 SQL 用 `requested_model`、`response_model`。
7. **monorepo 约定（复用 gotchas）**：`pnpm install` 必须在根目录（Turborepo 工作区），不要 `cd apps/*` 再装。
