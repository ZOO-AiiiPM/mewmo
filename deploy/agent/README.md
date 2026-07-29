# Mewmo Agent 服务部署

`@mewmo/agent` 是常驻 Fastify 服务，负责实时 Tool Loop、Deep Insight 和已确认动作的执行。它与一次性 Feed/AI Cron 分开部署；两者共享 PostgreSQL 与 `packages/ai` Runtime，但不共享进程生命周期。

## 网络边界

Compose 只绑定服务器回环地址 `127.0.0.1:3101`，不直接把 Agent 端口暴露到公网。容器同时加入反向代理的外部 Docker network（默认 `agent_default`），Caddy 通过唯一别名 `mewmo-agent-agent-1:3101` 访问 Agent。除 `/health` 外，所有接口都要求 Web BFF 签发的短时 HS256 身份令牌。

启动前确认代理 network 已存在；使用其他名称时在执行 Compose 前导出 `AGENT_PROXY_NETWORK`：

```bash
docker network inspect "${AGENT_PROXY_NETWORK:-agent_default}" >/dev/null
```

不要让容器内 Caddy 反代 `127.0.0.1:3101`：容器的回环地址只指向 Caddy 自身。也不要为了绕过 Docker network 把 Agent 端口改绑到 `0.0.0.0`。

Vercel Web 必须配置：

```text
AGENT_SERVER_URL=https://agent.example.com
AGENT_INTERNAL_SECRET=<至少 32 字符的随机密钥>
```

Agent 服务器的 `AGENT_IDENTITY_SECRET` 必须与 Web 的 `AGENT_INTERNAL_SECRET` 完全相同。不要把该密钥写入仓库、镜像、前端 `NEXT_PUBLIC_*` 变量或 Nginx 配置。

## Langfuse 可观测性

Langfuse 只在 Agent 后端进程启用。将重新生成的 Project key 写入 Git 忽略且权限为 `600` 的 `.env.agent`：

```text
LANGFUSE_PUBLIC_KEY=<project public key>
LANGFUSE_SECRET_KEY=<project secret key>
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_ENVIRONMENT=production
LANGFUSE_RELEASE=<构建镜像的完整 commit SHA>
```

两个 key 必须同时存在；同时留空会安全关闭 tracing，误配为单个 key 时也会禁用 tracing 并输出不含凭据的 warning，不会阻止 Agent 启动。Local 使用 `LANGFUSE_ENVIRONMENT=development`，Production 使用 `production`，Preview 不部署 Agent、也不注入 Production key。密钥不得写入仓库、Linear、截图、日志、镜像层或任何 `NEXT_PUBLIC_*` 变量。

每个非缓存 Turn 产生一个 `agent.turn` trace，模型调用和 Tool 是子 observation。Production 会上传完整业务 Input/Output，包括 provider payload、assistant message、Tool args/result；processor 只屏蔽 credential/authorization material（凭据与授权材料）。Langfuse 初始化、导出或 shutdown 失败均为 fail-open，不参与 Turn 或 PostgreSQL `AiUsageEvent` 的完成条件。

Prompt Markdown 仍以仓库为 source of truth（事实源）。发布镜像前由唯一 CI writer 执行 `pnpm langfuse:sync-prompts`；命令按内容 digest 去重，只在目标 label 内容变化时创建或复用 Langfuse Prompt version、移动 `LANGFUSE_PROMPT_LABEL`（默认取 `LANGFUSE_ENVIRONMENT`），并在所有临时文件写入成功后以 rename 分别原子替换两个 runtime manifest。同步失败不阻断 Agent 运行；CI 必须用 concurrency group 防止不同 runner 同时写同一 Langfuse project。

## 构建和传输镜像

在 Mac 项目根目录执行：

```bash
IMAGE_TAG=<commit-sha>
PNPM_REGISTRY=https://registry.npmmirror.com
docker buildx build --platform linux/amd64 --build-arg PNPM_REGISTRY="$PNPM_REGISTRY" -f deploy/agent/Dockerfile -t "mewmo-agent:$IMAGE_TAG" --load .
docker image inspect "mewmo-agent:$IMAGE_TAG" --format '{{.Architecture}} {{.Os}}'
ssh root@101.36.117.253 'mkdir -p /www/wwwroot/mewmo-agent'
scp deploy/agent/compose.yml deploy/agent/.env.agent.example root@101.36.117.253:/www/wwwroot/mewmo-agent/
docker save "mewmo-agent:$IMAGE_TAG" | gzip | ssh root@101.36.117.253 'gunzip | docker load'
```

镜像检查结果必须是 `amd64 linux`。

## 配置与启动

服务器执行：

```bash
cd /www/wwwroot/mewmo-agent
cp .env.agent.example .env.agent
chmod 600 .env.agent
nano .env.agent
docker tag "mewmo-agent:<commit-sha>" mewmo-agent:local
docker network inspect "${AGENT_PROXY_NETWORK:-agent_default}" >/dev/null
docker compose -f compose.yml config --quiet
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

`AI_MODEL_AGENT_CHAT` 和 `AI_MODEL_DEEP_INSIGHT` 可以相同。使用 `AI_PROVIDER=anthropic` 时不能把该 Provider 用于 Workflow Embedding；Embedding 由后台 Cron 的独立模型变量配置。

新 Schema 是 Agent 动作和 Workflow 的运行前提。启动新镜像前必须按[数据库迁移发布说明](../database/README.md)执行 `pnpm db:migrate:deploy`；Preview/Production 禁止使用 `db:push` 或旧的 `ai-agent-foundation.sql`。

## Nginx 反代

以下片段只展示必要边界，证书仍由现有 HTTPS 配置管理：

```nginx
location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 70s;
    proxy_send_timeout 70s;
}
```

不要使用 Nginx 注入固定 `Authorization`；每个请求的用户身份令牌必须由 Web BFF 单独签发。

## 验收、日志和回滚

```bash
curl --fail http://127.0.0.1:3101/health
docker exec agent-caddy-1 wget -qO- http://mewmo-agent-agent-1:3101/health
docker compose -f compose.yml logs --tail=100 agent
docker compose -f compose.yml ps
```

更新时传输唯一镜像标签，重新设置 `mewmo-agent:local` 后执行 `docker compose -f compose.yml up -d`。回滚时把 `mewmo-agent:local` 指向上一镜像并再次 `up -d`；数据库 Schema 必须同时兼容新旧版本。
