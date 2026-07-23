# Mewmo 后台 Cron 部署

后台镜像包含两个互相独立的一次性进程：

- `@mewmo/feed-ingestion` 获取、解析、清洗并保存 Feed 内容。
- `@mewmo/ai-workflows` 从 PostgreSQL 领取 AiRun，执行摘要、Embedding、推荐和笔记轻量洞察。

没有常驻 BullMQ Worker，也不需要 Redis。固定 Workflow 和自动化调度器都不接收入站请求，因此不需要域名、SSL、Nginx 或开放公网端口。Agent 自动化执行器使用 `deploy/agent/compose.yml` 的独立镜像和锁。

## 构建和传输镜像

在 Mac 项目根目录执行：

```bash
IMAGE_TAG=<commit-sha>
PNPM_REGISTRY=https://registry.npmmirror.com
docker buildx build --platform linux/amd64 --build-arg PNPM_REGISTRY="$PNPM_REGISTRY" -f deploy/worker/Dockerfile -t "mewmo-worker:$IMAGE_TAG" --load .
docker image inspect "mewmo-worker:$IMAGE_TAG" --format '{{.Architecture}} {{.Os}}'
ssh root@101.36.117.253 'mkdir -p /www/wwwroot/mewmo-worker'
scp deploy/worker/compose.yml deploy/worker/.env.worker.example root@101.36.117.253:/www/wwwroot/mewmo-worker/
docker save "mewmo-worker:$IMAGE_TAG" | gzip | ssh root@101.36.117.253 'gunzip | docker load'
```

镜像检查结果必须是 `amd64 linux`。构建流程继续按 lockfile integrity 校验依赖，不在服务器安装项目源码。

## 配置

服务器执行：

```bash
cd /www/wwwroot/mewmo-worker
cp .env.worker.example .env.worker
chmod 600 .env.worker
nano .env.worker
docker tag "mewmo-worker:<commit-sha>" mewmo-worker:local
docker compose -f compose.yml config --quiet
```

填写 Neon、AI Provider 和逻辑模型配置。`AI_MODEL_SUMMARY`、`AI_MODEL_EMBEDDING`、`AI_MODEL_RECOMMENDATION`、`AI_MODEL_NOTE_INSIGHT` 可以指向同一个模型，也可以按任务拆分；Embedding 必须使用提供 embedding API 的模型。`.env.worker` 不进入 Git 或 Docker 镜像。

旧的 `AI_SUMMARY_MODEL`、`AI_EMBEDDING_MODEL`、`AI_CHAT_MODEL` 只作为迁移期 fallback；新部署优先填写 `AI_MODEL_*`。当前 Runtime 已内置真实 Application/Database adapter，不再配置动态 adapter module。

## 手动验收

```bash
cd /www/wwwroot/mewmo-worker
docker compose -f compose.yml --profile cron run --rm feed-ingestion
docker compose -f compose.yml --profile cron run --rm ai-workflows
docker compose -f compose.yml --profile cron run --rm agent-automation-scheduler
```

Feed 成功日志包含 `feed_cron_completed`；AI 成功日志包含 `ai_workflows_completed`。无到期数据时都应快速退出并输出零计数。

## 每分钟 Cron

`flock` 防止同类进程重叠，数据库条件更新和 lease 负责跨入口的最终并发保护：

```cron
* * * * * cd /www/wwwroot/mewmo-worker && flock -n /var/run/mewmo-feed-ingestion.lock docker compose -f compose.yml --profile cron run --rm feed-ingestion >> /var/log/mewmo-feed-ingestion.log 2>&1
* * * * * cd /www/wwwroot/mewmo-worker && flock -n /var/run/mewmo-ai-workflows.lock docker compose -f compose.yml --profile cron run --rm ai-workflows >> /var/log/mewmo-ai-workflows.log 2>&1
* * * * * cd /www/wwwroot/mewmo-worker && flock -n /var/run/mewmo-agent-automation-scheduler.lock docker compose -f compose.yml --profile cron run --rm agent-automation-scheduler >> /var/log/mewmo-agent-automation-scheduler.log 2>&1
```

AI Cron 默认每批 10 个任务、并发 2。远程模型调用主要消耗网络等待；当前容器仍限制为 0.5 CPU、512 MB 内存。不要在此容器自托管 BGE-M3。

## 日志与故障检查

```bash
tail -n 100 /var/log/mewmo-feed-ingestion.log
tail -n 100 /var/log/mewmo-ai-workflows.log
tail -n 100 /var/log/mewmo-agent-automation-scheduler.log
docker compose -f compose.yml ps -a
```

Feed 模型故障不会阻止正文入库。AI 任务失败会保存在 PostgreSQL，最多重试三次；内容版本变化时旧任务标记为 `superseded`。

## 更新与回滚

更新时传输新的唯一镜像标签并重新设置 `mewmo-worker:local`。Compose Cron 不需要执行 `up -d`，下一次 crontab 会自动使用新标签。

回滚前先注释两条 crontab，并确认没有 `feed-ingestion` 或 `ai-workflows` 容器仍在运行，再把 `mewmo-worker:local` 指向旧镜像，最后恢复 crontab。这个顺序避免新旧进程并行领取同一批任务。
