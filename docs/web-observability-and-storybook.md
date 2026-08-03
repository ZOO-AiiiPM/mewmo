# Web 可观测性与 Storybook

## Sentry 配置

环境变量统一配置在运行平台或本地 shell，不提交真实 DSN 和上传凭据。

| 变量                             | 用途                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`         | 浏览器事件采集地址；Server/Edge 未配置私有 DSN 时也会回退使用它 |
| `SENTRY_DSN`                     | Server 与 Edge 事件采集地址                                     |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | 浏览器环境名；默认回退 `NEXT_PUBLIC_VERCEL_ENV`                 |
| `SENTRY_ENVIRONMENT`             | Server 与 Edge 环境名；默认回退 `VERCEL_ENV` / `NODE_ENV`       |
| `SENTRY_RELEASE`                 | 明确指定 release；Server/Edge 还会回退 commit SHA               |
| `SENTRY_AUTH_TOKEN`              | 构建时上传 source maps 的 token                                 |
| `SENTRY_ORG`                     | source map 所属 Sentry organization                             |
| `SENTRY_PROJECT`                 | source map 所属 Sentry project                                  |

运行时没有 DSN 时不会初始化 Sentry。只有 `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 三项齐全时，Next 构建才启用 source-map 上传；配置不完整不会阻断开发、请求或构建。

一期仅采集错误和 5% tracing。Replay、Feedback、Sentry Logs、HTTP body、Cookie、headers、query params、用户信息、数据库参数、生成式 AI 输入输出和 stack locals 均关闭。发送前还会递归过滤 credential、token、正文、prompt、messages、tool arguments/results，并从 URL 移除 query、hash 和内嵌凭据。

### 手动 smoke

使用测试 Sentry project 配置 DSN、environment 和唯一 release 后启动 Web：

```sh
pnpm --filter @mewmo/web dev
```

浏览器 DevTools Console 执行下列代码，确认 Sentry 收到 browser event：

```js
setTimeout(() => {
  throw new Error("sentry-browser-smoke");
}, 0);
```

Server SDK 可用下列一次性命令验证，不需要新增测试 API：

```sh
pnpm --filter @mewmo/web exec tsx -e 'import("./sentry.server.config.ts").then(async () => { const Sentry = await import("@sentry/nextjs"); Sentry.captureException(new Error("sentry-server-smoke")); await Sentry.flush(5000); })'
```

在 Sentry 中核对 event 的 environment、release、可读 stack trace；同时确认 URL 没有 query/hash，event 中没有 Cookie、Authorization、正文、prompt 或 tool payload。App Router 的 Server Component/request error 由 `onRequestError` 接入，最外层 React error 由 `global-error.tsx` 接入。

## Storybook

Storybook 是共享 UI 的隔离验收环境，不依赖登录、数据库或产品页面。它直接消费 `@mewmo/ui`，并导入 Web 的同一份 Tailwind/global theme token。

```sh
pnpm storybook
pnpm storybook:build
```

本地入口默认为 `http://localhost:6006`。工具栏的“浅色/深色”会切换 preview iframe 上的 `html.light` / `html.dark`；侧栏覆盖 `@mewmo/ui` 当前全部 11 个 primitives。Dialog、Modal 和 Dropdown story 可直接交互，a11y addon 用于人工检查可访问性结果。

静态 Storybook build 已纳入 monorepo `pnpm build`，但不单独部署、不接 Chromatic。AI Agent/Workflow 的 trace 与 usage 继续由 Langfuse 负责；Agent loop、token 和用户预算保护属于 ZOO-67，不在 Sentry 中重复实现。
