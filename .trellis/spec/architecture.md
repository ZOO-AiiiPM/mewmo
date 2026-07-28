# mewmo 架构（目录结构地图 + 数据架构）

> 本文件由 `agent.md` 抽出的项目专属层。协作层与写作哲学仍在 `agent.md`。

## 目录结构地图

```
mewmo/                              ← 项目根（协作元层）
├── apps/
│   ├── web/                        ← Next.js 16（浏览器 + 后端 API + Landing）
│   │   ├── src/app/                ← App Router 路由
│   │   │   ├── (marketing)/        ← Landing / 定价 / 博客（公开页）
│   │   │   ├── (auth)/             ← 登录注册
│   │   │   ├── (app)/              ← 登录后主界面
│   │   │   └── api/                ← REST API（Apple App 也调这些）
│   │   ├── src/components/         ← Web 端 UI 组件
│   │   └── src/lib/
│   │
│   ├── agent/                      ← Fastify + Pi AgentHarness（实时 Tool Loop / Session / Skills / Deep Insight）
│   ├── feed-ingestion/             ← 一次性 Feed 抓取 Cron
│   ├── ai-workflows/               ← 一次性 AI Workflow Cron
│   │
│   ├── admin/                      ← 管理后台骨架（Next.js）
│   └── extension/                  ← 浏览器扩展骨架
│
├── packages/
│   ├── db/                         ← Prisma + PostgreSQL（schema 唯一真相源）
│   ├── application/                ← 跨入口用例与端口契约
│   ├── ai/                         ← Pi-backed 共享 AI Runtime；仍含待清理的 legacy Agent/summary 兼容导出
│   ├── content/                    ← RSS/Atom 解析与正文提取
│   ├── sync/                       ← 同步协议定义 + Web 端实现
│   ├── auth/                       ← Auth.js 配置
│   ├── storage/                    ← S3/R2 文件存储
│   ├── email/                      ← 邮件模板 + 发送
│   ├── ui/                         ← 共享 Web UI 组件（Button/Input/Dialog）
│   └── shared/                     ← 公共类型 + 工具函数 + Zod validators
│
├── tooling/                        ← 工程标准化（ESLint/TS/Tailwind/Prettier 共享配置）
├── .github/workflows/              ← CI/CD
│
├── agent.md                        ← 冷启动协作入口
├── docs/                           ← 产品文档 + bug 索引
├── lessons/                        ← 踩坑复盘
├── turbo.json                      ← Turborepo 构建编排
└── pnpm-workspace.yaml             ← Workspace 声明
```

**关键认知**：这是 Turborepo monorepo。所有 pnpm 命令在项目根跑（`pnpm dev` 同时启动所有 apps）。单独跑某个 app 用 `pnpm --filter @mewmo/web dev`。packages 之间通过 `@mewmo/db`、`@mewmo/ai` 等包名互相引用。

---

## 数据架构

### Source of Truth

**PostgreSQL 是唯一真相源**。本地缓存与离线队列是目标架构，但当前仓库尚未完成 IndexedDB、SwiftData 或完整冲突解决；不要把规划中的 last-write-wins、version vector 当成现有能力。

### 核心表

| 数据 | 存储 | 为什么 |
|------|------|--------|
| 用户/认证 | PostgreSQL `users` | 多设备共享账号 |
| 笔记 | PostgreSQL `notes` | 云端同步 + 全文搜索 + AI 处理 |
| 剪藏 | PostgreSQL `clips` | 同上 |
| 订阅源 | PostgreSQL `feeds` | Feed Ingestion Cron 定时拉取 |
| 订阅条目 | PostgreSQL `feed_entries` | 量大、有已读状态 |
| AI 对话 | PostgreSQL `ai_chats` + `ai_messages` | 历史记录跨设备 |
| AI 上下文附件 | PostgreSQL `ai_context_attachments` | 保存对话所引用内容的快照 |
| 标签 | PostgreSQL `tags` (多对多) | 全局标签系统 |
| 同步游标 | PostgreSQL `sync_cursors` | 每设备记录同步位置 |
| 知识库 | PostgreSQL `knowledge_bases` + `knowledge_folders` + `knowledge_items` | 混合组织笔记、剪藏和订阅条目 |
| 笔记分享 | PostgreSQL `note_shares` | 受保护的只读分享链接 |
| 文件附件 | R2 / 七牛对象存储 | 图片/文件，数据库只存路径 |

### 同步模型

```
客户端调用 POST /api/sync/pull，提交时间游标
  → 服务端按 updatedAt 返回 note / clip / feed / feed_entry 增量
  → 返回新的 ISO 时间游标

客户端调用 POST /api/sync/push，提交 mutations
  → 当前支持 note / clip 的 create、update、delete
  → 当前支持 feed_entry 的 mark_read、mark_unread
  → 服务端成功更新时 version +1
```

核心可同步数据有 `id / version / updatedAt / deletedAt`，删除主要用 tombstone（软删除 + `deletedAt`）。`sync_cursors` 模型已存在，但当前 pull 使用客户端提交的 ISO 时间游标；Feed 写入、客户端离线队列、WebSocket 通知与完整冲突解决尚未完成。

### 标识符系统

- `id`：cuid，全局唯一主键
- `slug`：从 title 生成的 kebab-case，用于 URL 美化（`/notes/my-first-note`）
- 当前 title 更新不会同步修改 slug，也没有旧 slug redirect 表；新增这套行为必须先改 Schema 与路由，不能按旧设计假设已存在。
