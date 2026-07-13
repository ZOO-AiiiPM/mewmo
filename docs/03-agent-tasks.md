# mewmo 2.0 — Agent 分工任务书

> 给每个 coding agent 的任务书。按顺序执行，前置依赖标注在每个任务开头。
> 所有 agent 开始前先读 `agent.md`（或 `.claude/worktrees/2.0/agent.md`）了解完整架构。

---

## Agent 1：基建

**前置依赖**：无（第一个开始）
**分支**：`2.0`
**文件边界**：`turbo.json`、`docker/`、`tooling/`、根目录配置文件

### 目标

从零搭好 Turborepo monorepo 骨架，让其他 agent 能在各自目录开始写代码。

### 产出清单

1. **项目根目录初始化**：
   - `pnpm-workspace.yaml`
   - `turbo.json`（pipeline：dev / build / lint / test）
   - `package.json`（scripts：dev / build / lint / test / db:push / db:generate）
   - `tsconfig.json`（base config，strict: true）

2. **创建所有 apps 和 packages 空壳**（各含 `package.json` + `tsconfig.json` + `src/index.ts` 占位）：
   - `apps/web` — Next.js 16 App Router（`create-next-app` 初始化）
   - `apps/worker` — Node.js worker（纯 TS，`src/index.ts` 打印 "worker ready"）
   - `apps/admin` — Next.js（占位，`src/app/page.tsx` 显示 "Admin"）
   - `apps/extension` — 占位目录
   - `packages/db` — Prisma 初始化（空 schema）
   - `packages/ai`
   - `packages/sync`
   - `packages/auth`
   - `packages/queue`
   - `packages/storage`
   - `packages/email`
   - `packages/ui`
   - `packages/shared`

3. **`tooling/` 共享配置**：
   - `tooling/eslint/` — ESLint flat config
   - `tooling/typescript/` — base tsconfig
   - `tooling/tailwind/` — Tailwind 4 配置
   - `tooling/prettier/` — Prettier 配置

4. **`docker/docker-compose.yml`**：
   - PostgreSQL 15（port 5432，user: mewmo，db: mewmo_dev）
   - Redis 7（port 6379）

5. **环境变量**：
   - `.env.example`（DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, ANTHROPIC_API_KEY, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, RESEND_API_KEY）
   - `.gitignore`（node_modules, .env.local, .next, dist, .turbo, prisma/*.db）

6. **验证根 scripts 能跑**：
   - `pnpm install` 成功
   - `pnpm dev` 能启动（web 显示 Next.js 页面，agent 打印 ready）
   - `pnpm lint` 通过
   - `pnpm build` 通过
   - `docker compose up -d` 能起 Postgres + Redis

### 验收标准

- [ ] `pnpm install` 零报错
- [ ] `pnpm dev` 同时启动 web（localhost:3000）+ worker
- [ ] `pnpm lint && pnpm build` 通过
- [ ] Docker Compose Postgres + Redis 能连接
- [ ] 所有 package 之间 `@mewmo/xxx` 引用能 resolve

---

## Agent 2：数据层

**前置依赖**：Agent 1 完成
**分支**：`2.0`
**文件边界**：`packages/db`、`packages/auth`、`packages/queue`、`packages/storage`、`packages/email`、`packages/shared`

### 目标

搭好数据库 schema + 认证 + 队列 + 存储 + 共享类型。

### 产出清单

1. **`packages/db/prisma/schema.prisma`**：
   ```
   users          — id, email, name, avatarUrl, provider, createdAt, updatedAt
   notes          — id, slug, title, content, summary, pinned, version, userId, createdAt, updatedAt, deletedAt
   clips          — id, url, title, content, summary, favicon, version, userId, createdAt, updatedAt, deletedAt
   feeds          — id, url, title, description, favicon, refreshInterval(默认3600), lastFetchedAt, userId, createdAt
   feed_entries   — id, feedId, title, url, content, summary, author, publishedAt, readAt, version, userId, deletedAt
   ai_chats       — id, title, userId, createdAt, updatedAt
   ai_messages    — id, chatId, role(user/assistant), content, createdAt
   tags           — id, name, color, userId, isSystem, createdAt
   taggables      — id, tagId, taggableId, taggableType(note/clip/feed_entry)
   tag_pool       — id, name, userId, createdAt（用户的标签池）
   sync_cursors   — id, userId, deviceId, lastVersion, updatedAt
   sessions / accounts / verification_tokens — Auth.js 需要的表
   ```
   - 所有业务表有 `version` (Int, default 1) 用于增量同步
   - 删除用 `deletedAt` (DateTime?) 软删除
   - id 用 cuid

2. **`packages/db/src/repositories/`**：
   - `notes.ts` — CRUD + findByUserId + findBySlug + search(全文)
   - `clips.ts` — CRUD + findByUserId
   - `feeds.ts` — CRUD + findByUserId + findDueForRefresh
   - `feed-entries.ts` — CRUD + findByFeedId + markAsRead
   - `ai-chats.ts` — CRUD + findByUserId
   - `tags.ts` — CRUD + findByUserId + attachTag + detachTag
   - 所有查询必须带 `WHERE userId = ?` 或 `WHERE deletedAt IS NULL`

3. **`packages/auth/`**：
   - Auth.js v5 配置
   - Email provider（magic link）
   - Google OAuth provider
   - Prisma adapter（连接 packages/db）
   - middleware 导出（保护 /app/ 路由）

4. **`packages/queue/`**：
   - BullMQ 初始化（连接 Redis）
   - 队列定义：`tag-queue`、`summary-queue`、`feed-fetch-queue`、`embedding-queue`
   - 每个队列导出 `addJob()` helper

5. **`packages/storage/`**：
   - S3 Client 初始化（连接 Cloudflare R2）
   - `upload(file, path)` / `getUrl(path)` / `delete(path)`

6. **`packages/email/`**：
   - Resend 初始化
   - `sendVerification(email, token)` / `sendPasswordReset(email, token)`

7. **`packages/shared/`**：
   - `src/env.ts` — Zod 校验所有环境变量，启动时缺变量直接报错
   - `src/validators/` — Zod schema：createNote, updateNote, createClip, createFeed 等
   - `src/types/` — 共享 TypeScript 类型

### 验收标准

- [ ] `pnpm db:push` 成功推 schema 到本地 Docker Postgres
- [ ] `pnpm db:generate` 生成 Prisma Client
- [ ] repository 基本 CRUD 测试通过
- [ ] Auth.js 邮箱注册 + 登录流程能跑通（localhost 测试）
- [ ] 队列能 addJob + 消费
- [ ] R2 上传/下载能跑通（用 mock 或真实 R2）

---

## Agent 3：Web 前端

**前置依赖**：Agent 1 完成（页面骨架不依赖 Agent 2 全完成，可并行）
**分支**：`2.0`
**文件边界**：`apps/web/`、`packages/ui/`

### 目标

搭好 Web 端页面骨架 + 核心 UI 组件 + 编辑器。

### 产出清单

1. **路由结构**（`apps/web/src/app/`）：
   - `(marketing)/page.tsx` — Landing page（简单介绍 + 注册按钮）
   - `(auth)/login/page.tsx` — 登录
   - `(auth)/register/page.tsx` — 注册
   - `(app)/layout.tsx` — 登录后布局（侧边栏 + 主内容 + AI 侧边栏）
   - `(app)/notes/page.tsx` — 笔记列表
   - `(app)/notes/[slug]/page.tsx` — 笔记编辑
   - `(app)/clips/page.tsx` — 剪藏列表
   - `(app)/clips/[id]/page.tsx` — 剪藏阅读
   - `(app)/feeds/page.tsx` — RSS 订阅列表
   - `(app)/feeds/[id]/page.tsx` — 文章列表
   - `(app)/chat/page.tsx` — AI 对话
   - `(app)/settings/page.tsx` — 设置

2. **布局组件**：
   - `Sidebar` — 左侧导航（笔记/剪藏/RSS/AI/设置）
   - `AISidebar` — 右侧 AI 面板（可收起/展开）
   - `TopBar` — 顶部工具栏

3. **`packages/ui/`** 基础组件：
   - Button、Input、Textarea、Select
   - Dialog、Toast、Dropdown、Modal
   - Card、Badge、Spinner
   - 全部支持 dark/light mode（Tailwind `dark:` 前缀）

4. **编辑器**：
   - 安装 `@atomic-editor/editor`，在笔记编辑页集成
   - 同时保留备选：CodeMirror 6 + 自写 livePreview 方案
   - 两个方案可切换对比（设置里或 feature flag）

5. **列表虚拟滚动**：
   - 安装 `@tanstack/virtual`
   - 笔记列表、剪藏列表、RSS 文章列表均用虚拟滚动

6. **主题**：
   - 系统跟随 / 手动切换 深色/浅色
   - CSS 变量 + Tailwind dark mode

### 验收标准

- [ ] 所有路由能访问，无 404
- [ ] 深色/浅色模式切换正常
- [ ] 编辑器能输入 markdown 并实时渲染
- [ ] 列表能虚拟滚动（mock 1000 条数据测试）
- [ ] 响应式：桌面 + 平板宽度正常

---

## Agent 4：AI + Agent Worker

**前置依赖**：Agent 2 完成（需要队列和数据库）
**分支**：`2.0`
**文件边界**：`packages/ai/`、`apps/worker/`

### 目标

搭好 AI 调用层 + 后台 worker + RSS 定时拉取。

### 产出清单

1. **`packages/ai/src/providers/`**：
   - `index.ts` — 统一 provider registry
   - 支持：Anthropic（Claude）、OpenAI（GPT）、DeepSeek
   - 通过 Vercel AI SDK 的 `createOpenAI` / `createAnthropic` 初始化
   - 用户选择的主模型从数据库 user settings 读取

2. **`packages/ai/src/chains/`**：
   - `summarize.ts` — 输入文章/笔记内容 → 输出 240 字摘要（用小模型）
   - `auto-tag.ts` — 输入内容 + 用户标签池 → 输出 1-3 个标签 ID（用小模型）
   - `chat.ts` — 对话 chain（带上下文注入：当前内容、历史消息）

3. **`apps/worker/src/workers/`**：
   - `tag-worker.ts` — 消费 tag-queue，调 auto-tag chain，结果写入 taggables 表
   - `summary-worker.ts` — 消费 summary-queue，调 summarize chain，结果写入对应记录的 summary 字段
   - `feed-worker.ts` — 消费 feed-fetch-queue，HTTP 拉取 feed XML/JSON，解析后写入 feed_entries，然后给新条目入 summary-queue + tag-queue

4. **`apps/worker/src/jobs/`**：
   - `feed-fetch.ts` — cron 每 1 小时，查所有 feeds 表中 `lastFetchedAt < now - refreshInterval` 的源，入 feed-fetch-queue

5. **`apps/web/src/app/api/chat/route.ts`**：
   - Vercel AI SDK `streamText()` 实现
   - 读取用户设置的主模型
   - 上下文注入：当前打开的笔记/剪藏内容（通过 request body 传入）

6. **Agent 能力**（AI 对话可执行的动作）：
   - 搜索笔记/剪藏
   - 给指定内容打标签
   - 总结指定内容
   - 查询 "关于 XX 的内容有哪些"

### 验收标准

- [ ] `pnpm --filter @mewmo/worker dev` 启动后打印 "workers ready"
- [ ] 手动往 tag-queue 塞任务 → worker 消费 → 正确打标签
- [ ] 手动往 feed-fetch-queue 塞任务 → worker 拉取真实 RSS 源 → 写入 feed_entries
- [ ] `POST /api/chat` 流式返回 AI 回复
- [ ] cron job 每小时触发（可加速测试验证）

---

## 执行顺序

```
Week 1:  Agent 1 基建
Week 2:  Agent 2 数据层 + Agent 3 Web 前端（并行）
Week 3:  Agent 4 AI + 联调
Week 4:  验收 + 修 bug + 部署上线
```

---

## 部署配置（Agent 1 顺便配好）

| 服务 | 平台 | 配置 |
|------|------|------|
| Web | Vercel | 连接 GitHub repo，root = `apps/web` |
| Worker | Railway | Docker，root = `apps/worker` |
| PostgreSQL | Neon | 创建 project，拿 connection string |
| Redis | Upstash | 创建 database，拿 REDIS_URL |
| 文件存储 | Cloudflare R2 | 创建 bucket `mewmo-files` |
| 邮件 | Resend | 注册拿 API key |

环境变量统一配在各平台的 dashboard，本地开发用 `.env.local`。

---

## 补充任务：团队开发环境（任意 Agent 顺手加）

**前置依赖**：Agent 1 已完成
**目标**：让团队成员 clone 后 4 步跑起来，PR 自动生成线上预览。

### 产出清单

1. **`README.md` Getting Started 段**：
   ```
   git clone → cp .env.example .env.local → docker compose up -d → pnpm install → pnpm dev
   ```
   标注哪些 env 变量用共享 staging 值（NEXTAUTH_SECRET、DATABASE_URL staging），哪些需要各自申请（GOOGLE_CLIENT_ID 等 OAuth）。

2. **Vercel Preview Deploys 配置**：
   - `vercel.json` 或 Vercel Dashboard 设置：每个 PR 自动部署 Preview
   - Preview URL 格式：`pr-123.mewmo.vercel.app`
   - PR comment bot 自动贴 Preview 链接

3. **Neon Database Branching**：
   - 安装 Neon Vercel Integration（自动为每个 Preview 创建隔离数据库分支）
   - 或在 `.github/workflows/preview.yml` 里用 `neonctl branches create` 手动管理
   - Preview 环境自动拿到独立 DATABASE_URL，数据互不影响

4. **共享 Staging 环境**（`main` 分支持续部署）：
   - Vercel production deploy = staging（暂时，正式上线前改域名）
   - Neon 主库 = staging 数据库
   - Upstash Redis = staging 共用
   - 团队成员可以访问 staging URL 查看最新 main 效果

5. **`.env.example` 增加注释分组**：
   ```env
   # === 本地开发（docker compose 自动起） ===
   DATABASE_URL=postgresql://mewmo:mewmo@localhost:5432/mewmo_dev
   REDIS_URL=redis://localhost:6379

   # === 共享 staging（PR Preview 自动注入，本地不需要填） ===
   # NEON_DATABASE_URL=（Vercel Integration 自动设置）

   # === 各自申请（每个开发者自己的） ===
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=

   # === 团队共享（找 zoo 拿） ===
   NEXTAUTH_SECRET=
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   R2_ENDPOINT=
   R2_ACCESS_KEY=
   R2_SECRET_KEY=
   RESEND_API_KEY=
   ```

### 验收标准

- [ ] 新成员 clone 后按 README 4 步能跑起 localhost:3000
- [ ] PR 推上去 → Vercel 自动部署 Preview → PR comment 里有链接
- [ ] Preview 环境用独立数据库分支，不污染 staging 数据
- [ ] `main` 分支持续部署到 staging URL，团队可访问
