# mewmo 发布规则

> 本文件由 `agent.md` 抽出的项目专属层：部署矩阵、环境、资源边界、验证顺序。

## 部署

| App | 部署到 | 方式 |
|-----|--------|------|
| web | Vercel | git push 自动部署 |
| agent | 用户自有服务器 | Docker Compose 常驻 Fastify 服务，入口为 `deploy/agent/compose.yml`，只部署 Production，由 Web BFF 调用 |
| feed-ingestion / ai-workflows | 用户自有服务器 | `deploy/worker/compose.yml` 提供 Production 一次性进程，由 Cron 触发，不暴露公网端口；不部署 Preview |
| agent automation scheduler / executor | 用户自有服务器 | Scheduler 负责排队 `agent_automation`，Executor 使用 AgentHarness 执行；命令代码已在 `main`，当前 Compose/Cron 尚未完成接线，不能视为已部署 |
| admin | 待实现 | 目前只有页面骨架 |
| apple | App Store / TestFlight（规划） | 客户端尚未创建 |
| extension | Chrome Web Store（规划） | 目前只有 TypeScript 骨架 |

## 环境

| 环境 | 数据库 | 用途 |
|------|--------|------|
| development | Neon 开发分支（或本地直连 Neon） | 开发调试 |
| staging | Neon 分支 | PR Preview / 内测 |
| production | Neon 主库 | 正式用户 |

## Production Agent/Workflow 资源边界

服务器上已经有一个 Agent 实例，不能停止、重启、删除或覆盖它。Mewmo 只新增一个 Production Agent；Preview 不运行 Agent 或 Workflow。4 GB 内存不是 Mewmo 的专属配额，部署前必须检查 `free -h`、`swapon --show`、`docker stats --no-stream`、`docker ps` 和端口占用，再按实际余量设置 Compose 的 `mem_limit`/`mem_reservation`。当前 Compose 的固定值只是保守起点，后续应通过部署环境变量按余量调整；不要在服务器本地构建镜像，也不在服务器自托管模型、embedding 模型或 Langfuse。

## 验证顺序

**测试范围由改动决定，不由“每次都跑全量”的仪式决定。** 先识别本次改变的用户行为、模块、运行边界、数据边界和环境，再选能反证这些变化的最小测试集。与改动无关的套件从本次清单删除，因为无关输出只会消耗时间、token 和注意力；但跨越多个边界的改动要合并对应证据，不能用“节省成本”省掉相关验收。

验证域已有稳定入口，不要每次临时拼文件排除命令：

- `pnpm test:unit` 跑无 Web、PostgreSQL、固定账号或外网依赖的自包含测试；`pnpm test` 等于它，因此干净机器也应稳定复现。
- `pnpm test:integration` 跑真实 API 集成测试，脚本自己创建一次性 PostgreSQL、独立 Web 端口、唯一账号和本地 fixture，失败也会清理。当前 `main` 仍用 `db:push` 建测试库，因此只能验证最终 Schema 与 API 行为，不能证明 migration 历史可从空库回放；正式 migration 建立后必须改为 `db:migrate:deploy`，让集成测试同时验证迁移链。
- `pnpm test:theme` 只扫本次新增的主题硬编码颜色，避免为无关历史债务付出全库重写成本。它是早期防线，不能替代浏览器。
- `pnpm verify` 是 lint + 自包含测试 + 主题策略 + 生产构建，用于生产最低本地闸门。它不包含所有业务验收，所以 API 或 UI 改动仍要叠加相关集成或浏览器证据。

按改动类型选证据：纯逻辑跑相关单元测试；API 加验输入、认证、ownership、持久化和错误分支；UI 行为加浏览器交互；UI 视觉真实切换深色/浅色，检查正文、辅助文字、图标、输入与 placeholder、边框、hover / 选中 / 禁用 / 危险状态、弹窗、Popover、Toast、编辑器和外部内容，并验关键窗口尺寸；缓存/性能加验命中、后台刷新、失败回退、用户/资源隔离、mutation 一致性和请求数量。构建成功只证明能打包，不证明 UI 可读或交互正确。

**断言是产品契约，不是当前实现的快照。** 断言依据必须来自用户要求、已确认 spec、项目规则、API schema、数据约束或可复现缺陷。失败后先分类：需求未变是实现回归，修实现；需求已确认改变才更新断言，并确认新断言能区分旧/新行为；环境漂移修环境或 harness；过度绑定函数名、CSS 表达式或源码文本时，优先升级为行为断言。只为变绿而削弱断言会把回归改名为“新预期”，所以禁止。

**本地、GitHub CI 和 Vercel 是三个隔离环境。** 本地适合聚焦调试、真实服务和浏览器；CI 从干净 checkout 运行项目脚本，它的 `localhost` 只是 Runner 自己，不是已启动的 Vercel Web；Vercel `Ready` 只证明生产产物构建并部署，不代替 CI、API 集成或浏览器验收。交付和冒烟使用稳定生产别名 `https://mewmo.vercel.app`，随机部署 URL 只用于追溯某一份不可变产物。

无论改动大小，生产 push 保留固定最低闸门：本次相关测试通过、`pnpm verify` 通过、工作区干净、本地与远端 `main` 指向同一提交、GitHub CI 成功、Vercel Production 达到 `Ready`、稳定生产别名冒烟通过。

Schema 变更必须生成并提交 migration，部署环境只执行 `prisma migrate deploy`；`db:push` 只用于可销毁原型库。当前 `main` 已有 Agent/Workflow 新 Schema，但尚无 `packages/db/prisma/migrations/` 历史，也没有可用的根级 `db:migrate:*` 脚本，因此 Preview/Production Schema 不能描述为正式发布完成。首次纳管已有数据库时必须先备份、核验 drift，再按审核后的 baseline 名称执行 `prisma migrate resolve --applied <baseline>`；不能在已有表上直接执行 baseline SQL。Prisma 不会自动生成可靠降级，恢复依赖 Neon 备份/分支或 forward-fix migration；流程说明见 `deploy/database/README.md`。

最终报告必须说清“跑了什么、为什么相关、什么没跑、为什么不相关或不可用”。没有新鲜输出时不能用“应该通过”代替证据，也不能用一句“测试通过”隐藏实际范围。
