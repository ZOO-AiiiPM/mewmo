# Mewmo Worker 自有服务器部署

Worker 只主动访问 Neon、Upstash、Vercel 和 AI Provider，不接收公网请求。宝塔和服务器防火墙不需要为它开放任何入站端口，也不需要配置域名、SSL 或 Nginx 反向代理。

## 前置条件

- Linux 服务器已安装 Git、Docker Engine 和 Docker Compose v2。
- 宝塔用户可在软件商店安装 Docker 管理器，再使用宝塔终端执行下列命令。
- GitHub 私有仓库需要先在服务器配置只读 Deploy Key。

## 首次部署

```bash
mkdir -p /www/wwwroot/mewmo
cd /www/wwwroot/mewmo
git clone git@github.com:ZOO-AiiiPM/mewmo.git .
cp deploy/worker/.env.worker.example deploy/worker/.env.worker
```

上面的 SSH 地址用于私有仓库 Deploy Key；如果仓库公开，也可以改用 `https://github.com/ZOO-AiiiPM/mewmo.git`。

编辑 `deploy/worker/.env.worker`，填入生产环境的 Neon、Upstash、Vercel 和 AI 配置。`FEED_CRON_SECRET` 必须和 Vercel Production 中的同名变量完全一致。

先检查 Compose，再构建并启动：

```bash
docker compose -f deploy/worker/compose.yml config
docker compose -f deploy/worker/compose.yml up -d --build
docker compose -f deploy/worker/compose.yml ps
docker compose -f deploy/worker/compose.yml logs -f worker
```

正常启动日志包含 `workers ready`。按 `Ctrl+C` 只退出日志查看，不会停止容器。

## 更新

生产服务器只部署已经合并并验证的 `main`：

```bash
cd /www/wwwroot/mewmo
git switch main
git pull --ff-only
docker compose -f deploy/worker/compose.yml up -d --build
docker compose -f deploy/worker/compose.yml logs --tail=100 worker
```

## 停止与重启

```bash
docker compose -f deploy/worker/compose.yml restart worker
docker compose -f deploy/worker/compose.yml stop worker
docker compose -f deploy/worker/compose.yml start worker
```

Compose 使用 `restart: unless-stopped`。服务器重启后容器会自动恢复；手动执行 `stop` 后不会自动启动，直到执行 `start` 或 `up -d`。

## 回滚

先从 Git 日志选择已经验证过的提交，再以 detached HEAD 构建：

```bash
cd /www/wwwroot/mewmo
git log --oneline -10
git switch --detach <commit-sha>
docker compose -f deploy/worker/compose.yml up -d --build
docker compose -f deploy/worker/compose.yml logs --tail=100 worker
```

恢复最新正式版本：

```bash
git switch main
git pull --ff-only
docker compose -f deploy/worker/compose.yml up -d --build
```

## 故障检查

```bash
docker compose -f deploy/worker/compose.yml ps
docker compose -f deploy/worker/compose.yml logs --tail=200 worker
docker inspect mewmo-worker-worker-1 --format '{{.State.Status}} {{.State.ExitCode}}'
```

常见启动失败原因是 `.env.worker` 缺少变量、Upstash/Neon 地址错误、`FEED_CRON_SECRET` 与 Vercel 不一致，或服务器无法访问外部 AI API。禁止把 `.env.worker`、数据库地址或 API Key 粘贴到 Issue、Git 提交和公开日志中。
