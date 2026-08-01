# mewmo 开发规范 · 前端（Web）

> 本文件由 `AGENTS.md` 抽出的项目专属层。每条规范必须带 why。

- **列表虚拟滚动**：笔记/剪藏/订阅条目列表用 `@tanstack/virtual` 虚拟渲染。因为用户可能有几千条数据，全量渲染 DOM = 滚动卡顿。
- **列表只加载摘要**：API 返回 240 字 preview，不返回全文。点进详情才加载全文。
- **所有 `dangerouslySetInnerHTML` 必须走现有 sanitize 链路**：剪藏内容来自外部网页，不过滤 = XSS。当前清洗实现主要在 `apps/web/src/lib/clip-content.ts`，不要引用不存在的 shared util。
- **乐观更新（Optimistic UI）**：用户操作立刻更新本地 UI，不等服务器返回。失败时回滚。因为等网络 = 用户感知到延迟。
- **图标沿用 `apps/web/src/components/shell/PrototypeIcon.tsx` 的本地 SVG 系统**：当前项目没有 `@iconify/react` 或 Solar 离线包，不能按旧规划引入运行时 CDN。未选中态与激活态继续使用现有 line/fill 双态逻辑；新增图标先复用现有 key，确需新增时在同一组件内补齐并保持离线可用。
