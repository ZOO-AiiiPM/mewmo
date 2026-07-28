# mewmo 项目 Spec 索引

`agent.md` 保留冷启动协作层（产品定义 + 状态、写作约束、常用引用、协作规矩）。开发 / 项目专属规范抽到本目录，按任务加载：

## 跨模块项目规范（mewmo 全局）

| Spec | 内容 |
|------|------|
| [architecture.md](./architecture.md) | 目录结构地图 + 数据架构（Source of Truth / 核心表 / 同步模型）+ 标识符系统 |
| [dev-general.md](./dev-general.md) | 通用开发规范（TS strict / Zod / 主题语义色） |
| [dev-backend.md](./dev-backend.md) | 后端规范（API vs Server Actions / ownership / repositories / Cron 边界 / env） |
| [dev-frontend.md](./dev-frontend.md) | 前端规范（虚拟滚动 / 摘要 / sanitize / 乐观更新 / 图标系统） |
| [dev-ai.md](./dev-ai.md) | AI 层规范（Runtime 边界 / 入口归属 / Prompt-Eval / 会话流式 / Memory-凭据 / Usage） |
| [dev-apple.md](./dev-apple.md) | Apple 端（SwiftUI）未来实现约束 |
| [release.md](./release.md) | 部署矩阵 / 环境 / 资源边界 / 验证顺序 / Schema-migration |
| [gotchas.md](./gotchas.md) | 反直觉 4 条 + Repo Wiki 使用边界 |

## 按包分层的模板 Spec（`trellis init` 生成）

每个 `apps/*` 与 `packages/*` 在 `spec/<name>/backend|frontend/` 下有占位模板（directory-structure、error-handling、component-guidelines 等），随任务逐步填充真实约定。

## 思考指南（`guides/`）

- [guides/code-reuse-thinking-guide.md](./guides/code-reuse-thinking-guide.md)
- [guides/cross-layer-thinking-guide.md](./guides/cross-layer-thinking-guide.md)
