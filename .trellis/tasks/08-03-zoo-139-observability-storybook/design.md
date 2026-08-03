# Technical Design

## Selection

- Web/API 选择官方 `@sentry/nextjs`：它直接支持 Next.js 16 App Router 的 browser、Node.js、Edge、`onRequestError`、global error 和 source-map 上传。OpenTelemetry 需要额外 collector/backend 才能形成可用错误产品，Better Stack 更偏日志与 uptime，均不适合作为一期最小闭环。
- UI workshop 选择 Storybook 10：`@storybook/nextjs-vite` 官方支持 Next 16、React 19 和 Vite，能沿用 Next alias、global CSS 和未来纯客户端 Web 组件。Ladle 更轻但 Next 集成与 addon 生态较弱；Histoire 当前为 beta。

## Web Observability Boundary

1. `apps/web/instrumentation-client.ts` 初始化 browser SDK，并导出 router transition hook。
2. `apps/web/sentry.server.config.ts` 与 `sentry.edge.config.ts` 初始化各自 runtime。
3. 现有 `apps/web/src/instrumentation.ts` 保留代理注册，再按 runtime 动态导入 Sentry config，并导出 `onRequestError`。
4. `apps/web/src/app/global-error.tsx` 只承担 App Router 最外层错误上报与通用故障 UI，不暴露错误详情。
5. `apps/web/next.config.mjs` 在 source-map 上传变量齐全时才应用 `withSentryConfig`；否则导出原有 `next-intl` config，避免无凭据构建噪音和额外上传工作。

共享 runtime 配置和纯脱敏逻辑放在 `apps/web/src/lib/observability/`。三端初始化复用同一配置生成函数；环境读取留在各 runtime 文件，避免服务端变量误进浏览器 bundle。

### Privacy Contract

- SDK 层关闭默认 PII 和 HTTP request bodies。
- `beforeSend` 对 `request.headers`、`request.data`、`user`、`contexts`、`extra`、`breadcrumbs.data` 等事件树执行 allow-location/redact-content 处理。
- 递归脱敏按字段名匹配 credential、auth、cookie、password、secret、token、content/body、prompt/message、argument/result 等类别；数组、对象和有限深度均处理，不修改原对象。
- URL 保留 origin/path 供定位，移除 query/hash，避免分享 token、搜索词等进入事件。
- 不启用 Replay、Feedback 或 Logs；如以后需要，另开 Issue 重新评估内容采集边界。

### Environment And Release

- Browser DSN 使用 `NEXT_PUBLIC_SENTRY_DSN`；它是公开采集地址，不是认证 secret。
- Server/Edge 可优先使用 `SENTRY_DSN`，否则回退到 public DSN。
- environment 分 server `SENTRY_ENVIRONMENT` 与 browser `NEXT_PUBLIC_SENTRY_ENVIRONMENT`，默认按 Vercel/Node 环境推导。
- release 优先 `SENTRY_RELEASE`，回退 `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`；客户端由 Sentry build integration 注入同一 release。
- Source maps 仅在 `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 都存在时上传。

## Storybook Boundary

`apps/storybook` 是开发工具 workspace，不是新的产品部署入口：

- `.storybook/main.ts` 使用 `@storybook/nextjs-vite`，stories 只扫描本 app 目录。
- `.storybook/preview.tsx` 导入 Web 的现有 `globals.css`，并用官方 theme-by-class decorator 把工具栏选择映射为 `html.light` / `html.dark`。
- stories 从 `@mewmo/ui` 导入组件；需要开关状态的弹层使用 story-local React state，不修改组件 API。
- `package.json` 的 `build` 执行静态 Storybook build，使根 `turbo build` 自动检查；产物为 `storybook-static/**`。
- 不配置 Vercel deployment 或 Chromatic。需要共享访问和截图 diff 时另行评估。

## Rollout And Rollback

- Sentry 无配置时为 no-op，可通过移除环境变量立即停发；SDK 故障不能阻断请求。
- Storybook 不参与 Web runtime bundle；若其静态构建失败，可独立回滚 `apps/storybook` 而不改变产品组件。
- 本任务不改数据库 schema、同步协议、shared types 或产品 API contract。
