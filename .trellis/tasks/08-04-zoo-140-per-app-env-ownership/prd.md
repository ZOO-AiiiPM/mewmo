# ZOO-140 Per-app environment ownership

## Goal

修复本地运行时误读仓库根 env，统一 Web、Agent、AI Workflow 的 app-local 环境归属。

## Requirements

- Web 本地只使用 ignored 的 `apps/web/.env.local`，由 Next.js 原生加载。
- Agent 本地 `dev`、`start:local` 与 `cron:automations:local` 只加载 `apps/agent/.env.local`；Production 命令不得加载开发文件。
- AI Workflow 本地命令只加载 `apps/ai-workflows/.env.local`；Production 命令继续依赖部署注入。
- Prisma 与数据库维护脚本只接受显式 `DATABASE_URL`，或回退到 `apps/web/.env.local`；不得读取仓库根 env。
- 三个 app 提供只包含所属变量名和安全默认值的 `.env.local.example`，不得包含真实凭据。
- 本地 Docker 的数据库、Redis 与 Agent 地址由 app-local 文件持有；共享相同值不代表共享配置文件。
- Runtime、测试、维护脚本和 worktree 指引不得创建或读取仓库根 `.env.local` 软链。
- 不打印、提交、轮换或自动删除任何真实 env 文件；不修改 Production、数据库 Schema 或业务逻辑。

## Acceptance Criteria

- [ ] 从无继承 app env 的 shell 启动时，Web、Agent、Workflow 仅加载各自 app-local 文件。
- [ ] 缺失 app-local 文件时 fail fast，不回退根 env。
- [ ] Agent 本地 dev 命令通过 health；Web 能连接本地 Agent。
- [ ] Web 与 Agent 使用本地 Docker 数据库完成开发账号登录和真实 Agent 冒烟，不连接根 env 中的 Neon。
- [ ] Production Agent/Workflow 命令不包含 `--env-file`。
- [ ] 全仓 runtime/tooling 扫描无仓库根 `.env.local` 或 `.env.workflow.local` 引用。
- [ ] 相关单元/静态测试、lint、TypeScript/build 与 `git diff --check` 通过。

## Notes

- Linear: ZOO-140.
- 历史实现 `f33363b` 只作为迁移素材；不得携带其父提交或旧 task。
