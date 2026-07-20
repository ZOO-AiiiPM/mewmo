# Mewmo Agent 服务部署

`@mewmo/agent` 是常驻 Fastify 服务，负责实时 Tool Loop、Deep Insight 和已确认动作的执行。它与一次性 Feed/AI Cron 分开部署；两者共享 PostgreSQL 与 `packages/ai` Runtime，但不共享进程生命周期。

## 网络边界

Compose 只绑定服务器回环地址 `127.0.0.1:3101`，不直接把 Agent 端口暴露到公网。使用 Nginx/Caddy 在同一台服务器提供 HTTPS 域名并反代到该地址。除 `/health` 外，所有接口都要求 Web BFF 签发的短时 HS256 身份令牌。

Vercel Web 必须配置：

```text
AGENT_SERVER_URL=https://agent.example.com
AGENT_INTERNAL_SECRET=<至少 32 字符的随机密钥>
```

Agent 服务器的 `AGENT_IDENTITY_SECRET` 必须与 Web 的 `AGENT_INTERNAL_SECRET` 完全相同。不要把该密钥写入仓库、镜像、前端 `NEXT_PUBLIC_*` 变量或 Nginx 配置。

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
docker compose -f compose.yml config --quiet
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

`AI_MODEL_AGENT_CHAT` 和 `AI_MODEL_DEEP_INSIGHT` 可以相同。使用 `AI_PROVIDER=anthropic` 时不能把该 Provider 用于 Workflow Embedding；Embedding 由后台 Cron 的独立模型变量配置。

新 Schema 是 Agent 动作和 Workflow 的运行前提。仓库当前只有 `db:push`，没有 migration；未获得生产数据库变更授权前，不要在生产库执行 Schema push，也不要启动依赖新表的 Agent/Cron。

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
docker compose -f compose.yml logs --tail=100 agent
docker compose -f compose.yml ps
```

更新时传输唯一镜像标签，重新设置 `mewmo-agent:local` 后执行 `docker compose -f compose.yml up -d`。回滚时把 `mewmo-agent:local` 指向上一镜像并再次 `up -d`；数据库 Schema 必须同时兼容新旧版本。
