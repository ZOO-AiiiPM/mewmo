# ZOO-102 Agent 本地 Docker 验收：DeepSeek 官方模型（不影响 Workflows）

## Goal

在独立 `mewmo-agent` AO workspace 中启动并验证本地 Agent Runtime，且 Agent 模型使用 DeepSeek 官方付费 API。本次只配置 Agent 进程的 provider/model，不改变 AI Workflows 的 provider/model，也不触碰 Production。

## 背景（事实源）

- Agent 是常驻 Fastify 服务（`apps/agent`），入口 `src/index.ts`，绑定 `config.AGENT_HOST`/`config.AGENT_PORT`，`/health` 无需鉴权返回 `{ ok: true }`。
- 除 `/health` 外所有路由要求 `Authorization: Bearer <HS256 JWT>`，由 `AGENT_IDENTITY_SECRET` 签发，issuer/audience 默认 `mewmo-web`/`mewmo-agent`（`src/identity.ts`，`signIdentityForTest` 用于测试签 token）。
- AI Runtime（`packages/ai/src/runtime/env.ts`）原生支持 `AI_PROVIDER=deepseek`，对应 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_BASE_URL`（缺省 `https://api.deepseek.com`），聊天/深度洞察模型走 `AI_MODEL_AGENT_CHAT`/`AI_MODEL_DEEP_INSIGHT`。
- Agent 配置校验在 `apps/agent/src/config.ts`（envSchema），`AGENT_IDENTITY_SECRET` 至少 32 字符，`AGENT_CHAT_THINKING_LEVEL` 是合法枚举配置。
- 本地环境文件 `deploy/agent/.env.agent`（gitignore，mode 600）仅含 Agent process 的配置与 DeepSeek 凭据；不含 Workflow 模型变量（`AI_MODEL_RECOMMENDATION`/`AI_MODEL_NOTE_INSIGHT`/`AI_MODEL_SUMMARY`/`AI_MODEL_EMBEDDING` 等）。
- 本机已有 Docker 容器（PostgreSQL 多实例 + Redis），ZOO-102 要求只读复用，不停止/重建/删除。

## 范围

- 复用当前本机 Docker PostgreSQL/Redis，先做只读连接与端口验证，不停止或重建已有容器。
- 为 Agent 本地进程配置 `AI_PROVIDER=deepseek`、DeepSeek 官方 base URL、Agent chat/deep-insight 模型与本地密钥。凭据只进入 gitignored 本地 env 文件，不写入 Git/Linear/日志/截图/进程参数。
- 安装/复核依赖与 Prisma client，执行 migration status。
- 启动 Agent 服务并验证 `/health`。
- 使用合法短时身份 token 完成一次真实 Agent chat/SSE 冒烟，确认实际 provider/model；记录失败证据与 blocker。

## 非目标

- 不修改 `deploy/worker/.env.worker`、AI Workflows 的 provider/model、Cron 或自动化配置。
- 不部署 Production、不 push、不 merge、不创建新的 issue/session/worktree/branch/PR。
- 不停止、删除或重建已有 Docker 容器。
- 不把本地密钥（尤其 `DEEPSEEK_API_KEY`、`AGENT_IDENTITY_SECRET`、`DATABASE_URL`）写入任何跟踪文件或输出。
- 不改 Workflow 定义或用 Workflow 模型变量污染 Agent 本地环境。

## 验收标准

- [ ] Agent 独立本地环境明确使用 DeepSeek 官方付费 API（`AI_PROVIDER=deepseek` + 官方 base URL + 模型）。
- [ ] Workflow 相关环境（`deploy/worker/.env.worker`）与模型变量在 Git diff 中无改动。
- [ ] PostgreSQL/Redis 前置只读检查通过，Agent `/health` 可访问（HTTP 200，`{ ok: true }`）。
- [ ] 依赖已安装、Prisma client 已生成、migration status 结果已记录。
- [ ] 至少一次真实带鉴权的 Agent 请求得到可验证结果，或形成准确 blocker（附 sanitized 证据）。
- [ ] 配置文件均被 gitignore，`git status`/diff 不含任何凭据值。

## Notes

- 本任务是 local-only 验证，不改 product 代码；如有必要仅收录任务/文档类变更。
- 所有证据一律 sanitize，凭据值绝不落盘或打印。
- Complex task → 需 `design.md` 与 `implement.md`，并在 `task.py start` 前完成 review gate。
