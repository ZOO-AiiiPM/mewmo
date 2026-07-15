# Mewmo Worker 自有服务器部署

常驻 Worker 只消费 AI Summary 队列；RSS 更新由同一镜像中的一次性 Feed Cron 直接访问 Neon。它们会主动访问 Neon、Upstash、订阅源和 AI Provider，但不接收公网请求。宝塔和服务器防火墙不需要为它开放任何入站端口，也不需要配置域名、SSL 或 Nginx 反向代理。

镜像在 Mac 本机构建为服务器需要的 `linux/amd64` 架构，服务器只负责导入和运行。这样依赖安装和 Docker 构建不会占用生产服务器的内存。

## 前置条件

- Mac 已安装并启动 Docker Desktop，项目依赖已安装。
- Linux 服务器已安装 Docker Engine 和 Docker Compose v2。
- 本地终端可以通过密码登录服务器；不需要向服务器写入 Mac 的 SSH 公钥。

## 1. 在 Mac 构建镜像

以下命令只在 Mac 的项目根目录执行：

```bash
IMAGE_TAG=zoo-35
PNPM_REGISTRY=https://registry.npmmirror.com
docker buildx build --platform linux/amd64 --build-arg PNPM_REGISTRY="$PNPM_REGISTRY" -f deploy/worker/Dockerfile -t "mewmo-worker:$IMAGE_TAG" --load .
docker image inspect "mewmo-worker:$IMAGE_TAG" --format '{{.Architecture}} {{.Os}}'
```

`PNPM_REGISTRY` 只影响构建时依赖下载；Dockerfile 默认仍使用 npm 官方 Registry。在中国网络下显式使用 npmmirror，并继续按 lockfile integrity 校验包内容。镜像检查结果必须是 `amd64 linux`；如果不是，不要传到服务器。

## 2. 从 Mac 传到服务器

仍在 Mac 项目根目录执行。SSH 会要求输入服务器密码，密码只用于本次连接，不写入项目文件：

```bash
ssh root@101.36.117.253 'mkdir -p /www/wwwroot/mewmo-worker'
scp deploy/worker/compose.yml deploy/worker/.env.worker.example root@101.36.117.253:/www/wwwroot/mewmo-worker/
docker save "mewmo-worker:$IMAGE_TAG" | gzip | ssh root@101.36.117.253 'gunzip | docker load'
```

这个流程只传部署配置和已经构建好的镜像，不把 GitHub 凭据或项目源码目录放到服务器。

## 3. 在服务器配置环境

以下命令只在已经登录的服务器终端执行：

```bash
cd /www/wwwroot/mewmo-worker
cp .env.worker.example .env.worker
chmod 600 .env.worker
nano .env.worker
```

在 `.env.worker` 填入 Neon、Upstash 和 AI 配置。Feed Cron 直接访问数据库，不再需要 Vercel 地址或 `FEED_CRON_SECRET`。SSH 密码不属于 Worker 配置，不能写入这个文件。

## 4. 在服务器启动

```bash
cd /www/wwwroot/mewmo-worker
docker tag mewmo-worker:zoo-35 mewmo-worker:local
docker compose -f compose.yml config --quiet
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
docker compose -f compose.yml logs -f worker
```

正常启动日志包含 `workers ready`。按 `Ctrl+C` 只退出日志查看，不会停止容器。

确认资源限制已经生效：

```bash
docker inspect mewmo-worker-worker-1 --format 'memory={{.HostConfig.Memory}} reservation={{.HostConfig.MemoryReservation}} nano_cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}}'
docker stats --no-stream mewmo-worker-worker-1
```

预期内存上限为 `536870912`，预留为 `134217728`，CPU 为 `500000000`，PIDs 为 `128`。

## 5. 配置 Feed Cron

先手动执行一次 one-shot runner：

```bash
cd /www/wwwroot/mewmo-worker
docker compose -f compose.yml --profile cron run --rm feed-cron
```

输出应包含一行 `feed_cron_completed` JSON，以及本轮 `selected`、`succeeded`、`partial`、`failed`、`skipped` 计数。确认手动执行正常后，编辑服务器 crontab：

```bash
crontab -e
```

加入每分钟任务。`flock` 防止上一轮尚未退出时又启动第二个容器；数据库 lease 仍负责防止不同入口同时领取同一 Feed：

```cron
* * * * * cd /www/wwwroot/mewmo-worker && flock -n /var/run/mewmo-feed-cron.lock docker compose -f compose.yml --profile cron run --rm feed-cron >> /var/log/mewmo-feed-cron.log 2>&1
```

检查 Cron 日志：

```bash
tail -n 100 /var/log/mewmo-feed-cron.log
```

## 更新

在 Mac 使用新的唯一标签重新构建并传输，例如提交号。不要覆盖旧标签，它们用于回滚：

```bash
IMAGE_TAG=<commit-sha>
PNPM_REGISTRY=https://registry.npmmirror.com
docker buildx build --platform linux/amd64 --build-arg PNPM_REGISTRY="$PNPM_REGISTRY" -f deploy/worker/Dockerfile -t "mewmo-worker:$IMAGE_TAG" --load .
docker save "mewmo-worker:$IMAGE_TAG" | gzip | ssh root@101.36.117.253 'gunzip | docker load'
scp deploy/worker/compose.yml root@101.36.117.253:/www/wwwroot/mewmo-worker/compose.yml
```

然后在服务器切换 `local` 标签并重建容器：

```bash
cd /www/wwwroot/mewmo-worker
docker tag "mewmo-worker:<commit-sha>" mewmo-worker:local
docker compose -f compose.yml up -d --force-recreate
docker compose -f compose.yml logs --tail=100 worker
```

## 停止与重启

```bash
cd /www/wwwroot/mewmo-worker
docker compose -f compose.yml restart worker
docker compose -f compose.yml stop worker
docker compose -f compose.yml start worker
```

Compose 使用 `restart: unless-stopped`。服务器重启后容器会自动恢复；手动执行 `stop` 后不会自动启动，直到执行 `start` 或 `up -d`。

## 回滚

先注释 crontab 中的 Feed Cron，并确认没有 `feed-cron` 容器在运行，再切回旧镜像。否则新 Cron 会和旧版 Feed Worker 同时抓取。服务器会保留以前导入的带标签镜像，选择一个已验收的旧标签：

```bash
cd /www/wwwroot/mewmo-worker
docker image ls mewmo-worker
docker tag "mewmo-worker:<previous-tag>" mewmo-worker:local
docker compose -f compose.yml up -d --force-recreate
docker compose -f compose.yml logs --tail=100 worker
```

## 故障检查

```bash
cd /www/wwwroot/mewmo-worker
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=200 worker
docker inspect mewmo-worker-worker-1 --format '{{.State.Status}} {{.State.ExitCode}}'
```

常见启动失败原因是 `.env.worker` 缺少变量、Upstash/Neon 地址错误、订阅源网络不可达，或服务器无法访问外部 AI API。禁止把 `.env.worker`、数据库地址或 API Key 粘贴到 Issue、Git 提交和公开日志中。
