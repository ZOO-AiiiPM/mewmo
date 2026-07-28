# mewmo 反直觉 & 坑（对抗先验）

> 本文件由 `agent.md` 抽出的项目专属层。模型有强先验，这些是最容易踩错的地方。

## 反直觉 & 坑

1. **monorepo 根目录不是 app**。`pnpm install` 在根目录跑，`pnpm dev` 在根目录跑（Turborepo 并行启动所有 apps）。不要 `cd apps/web` 再 `pnpm install`——workspace 依赖解析必须从根开始。

2. **packages 之间有依赖方向**：`shared` 不依赖任何其他 package；`db` 只依赖 `shared`；`ai`/`auth`/`storage` 可依赖 `db` + `shared`；`apps` 可依赖任何 package。反向依赖（package 依赖 app）= 架构错误。

3. **Server Actions 只能被 Web 调用**。Apple App 和浏览器扩展调的是 API Routes（`apps/web/src/app/api/`）。因为 Server Actions 是 Next.js 的 RPC 机制，只在 React Server Component 上下文可用。外部客户端必须走标准 HTTP API。

4. **Apple 端和 Web 端将是两套独立 UI 代码，但 Apple 端尚未创建**。未来不共享组件（一个是 React，一个是 SwiftUI），只共享后端 API + 同步协议行为规范。不要因为目录地图里写了规划就假设文件已经存在。

## Repo Wiki 使用边界

`.qoder/repowiki/` 是 Qoder 按提交自动生成并导出的代码导航，适合在陌生模块、跨模块改动或架构解释前按关键词检索相关页面和源码入口；它不是需求、API 契约或完成度的真相源。Wiki 会把代码结构扩写成通用设计，且可能引用已移动或不存在的文件，所以其中的字段、命令、能力与行为结论必须回到当前源码、测试、正式 spec 或 `agent.md` 核验，冲突时以后者为准。

生成与更新由 Qoder 的 Auto Update / Auto Export 负责，Agent 不手改生成文件。使用前按需读取 `.qoder/repowiki/zh/meta/repowiki-metadata.json` 的 `last_commit_id` 并与当前 `HEAD` 比较；不一致时只把 Wiki 当搜索线索，不能据此断言当前实现。
