# mewmo 开发规范 · 后端（Next.js API + Server Actions）

> 本文件由 `AGENTS.md` 抽出的项目专属层。每条规范必须带 why。

- **API Route 用于外部调用**（Apple App、扩展、webhook），返回 JSON。Server Actions 用于 Web 前端内部调用（表单提交等）。因为 Server Actions 不能被非 Web 客户端调用。
- **每个 API 必须验证 userId ownership**：查 note 时 `WHERE userId = currentUser.id`，不能只靠 noteId 查。因为猜测 ID 就能看到别人数据 = 严重安全漏洞。
- **新增可复用数据库操作优先放 `packages/db/src/repositories/`**：当前部分 API route 仍直接写 Prisma；不要借小需求无关重构，但新逻辑应避免继续扩散重复查询。
- **长耗时操作不占用 API 请求生命周期**：Feed Ingestion 和 AI Workflows 由一次性 Cron 运行，通过 PostgreSQL 状态、lease 与幂等更新领取工作；实时 Agent 是独立 Fastify 服务。当前没有 Redis/BullMQ，不能按旧架构重新引入队列或假设存在常驻队列消费者。
- **环境变量由 runtime 所有者注入**：Production 使用各部署平台 dashboard / deploy env，本地严格使用 app-owned `.env.local`；数据库 URL、API key、OAuth secret 等禁止硬编码或从仓库根 env 隐式继承。具体路径、命令与测试合同见 [environment-ownership.md](./environment-ownership.md)。`packages/shared/src/env.ts` 用 Zod 校验各运行入口需要的 env，启动时缺 env 直接报错而非运行时才炸。
