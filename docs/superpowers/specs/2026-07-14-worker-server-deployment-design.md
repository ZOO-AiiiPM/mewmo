# Worker 自有服务器部署设计

## 目标

把当前 `apps/worker` 作为一个 Docker 常驻服务部署到用户自有服务器，使 Vercel Web 写入 Upstash Redis 的 RSS、AI 和现有后台任务在无人打开本地电脑时仍能被消费。Web、Neon 和 Upstash 保持现有部署位置不变。

## 架构

```text
Vercel Web/API -> Upstash Redis -> Docker Worker (自有服务器) -> Neon
       |                                      |
       +-- cron refresh endpoint <-----------+
       +-- external AI APIs <----------------+
```

Worker 通过主动出站连接访问 Redis、数据库、Vercel 和 AI Provider，不提供公网 HTTP 端口。镜像在 Mac 使用 Buildx 构建为 `linux/amd64`，服务器只导入镜像；Docker Compose 负责环境变量注入、资源隔离、自动重启和日志保留。未来独立 Agent 不在本次范围内；它可以复用同一台服务器，但必须另建运行时边界。

## 运行时边界

`packages/queue` 只校验并读取 `REDIS_URL`，不再因为 Web 专用的 OAuth、邮件或文件存储变量阻止 Worker 启动。`packages/shared` 提供 Worker 专用环境加载器，Worker 入口启动时校验自己的最小配置：`DATABASE_URL`、`REDIS_URL`、`FEED_REFRESH_BASE_URL` 或本地兼容的 `NEXTAUTH_URL`，以及当前摘要任务需要的 AI Provider、API Key 和 `AI_SUMMARY_MODEL`。生产环境还必须提供 `FEED_CRON_SECRET`，用于 Worker 调用 Vercel 的受保护刷新接口。

生产启动使用 `tsx src/index.ts`。当前 TypeScript 编译结果保留无扩展名 ESM 导入，不能直接用 Node 执行；源码运行能正确解析 monorepo workspace 包和 AI Prompt 文件，后续可以单独做 bundling 优化。

镜像显式安装 OpenSSL 3，确保 Prisma 使用 `debian-openssl-3.0.x` 引擎。Corepack 缓存放在所有运行用户可读的 `/opt/corepack`，容器启动时不再联网下载 pnpm；构建依赖使用 BuildKit pnpm store 缓存，并允许通过非敏感 build arg 选择 Registry，镜像运行环境不保留该 Registry 配置。

Worker 进程保存三个 BullMQ 消费者和一个 Feed scheduler 的句柄，并在 `SIGTERM`/`SIGINT` 时先停止 scheduler，再等待所有消费者关闭。Compose 使用 `restart: unless-stopped` 和 `init: true`，服务器重启或进程异常后自动恢复。

服务器与现有项目共享约 4GB 内存，且没有 swap。Worker 运行容器因此限制为 512MB 内存、128MB 内存预留、0.5 CPU 和 128 PIDs；Node heap 限制为 384MB，为原生内存和运行时开销保留空间。资源限制只约束运行容器，所以依赖安装与镜像构建放在 Mac，不在生产服务器执行。

## 配置与安全

仓库提交 `deploy/worker/.env.worker.example`，不提交真实的 `.env.worker`。Compose 不映射端口，服务器防火墙不需要为 Worker 开放入站端口。生产密钥只通过服务器文件或宝塔环境变量注入，禁止写入镜像、Git 或启动日志。

## 验证

- Worker 专用环境缺失时启动校验失败，并指出缺失变量。
- `pnpm --filter @mewmo/worker test`、构建和 lint 通过。
- `docker compose config` 能解析部署文件。
- Compose 解析结果包含镜像引用和资源限制，且不包含 `build` 或公网端口。
- 本机构建镜像的架构为 `amd64 linux`。
- 容器启动后日志包含 `workers ready`，进程收到终止信号时关闭所有 Worker。
- 真实环境完成 RSS 任务消费和 AI 摘要回写验证。

## 非目标

本次不实现独立 `apps/agent`，不重写剪藏流程，不迁移 Neon/Upstash，不做 Redis command 或 Worker 性能调优，也不在服务器上部署 Web。队列定义中尚无消费者实现的 tag/embedding 能力不在部署 issue 中补业务逻辑。
