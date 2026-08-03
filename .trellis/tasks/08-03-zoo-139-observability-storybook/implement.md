# Implementation Plan

1. 加入 Sentry 与 Storybook 官方依赖，确认 pnpm lockfile、Turbo workspace 和 Next 16 peer compatibility。
2. 先为事件递归脱敏、URL 清理和无 DSN fail-open 写 focused tests，再实现 `apps/web/src/lib/observability/` 纯逻辑。
3. 接入 browser/server/edge/global-error/Next instrumentation；保留现有代理初始化，按完整上传配置条件包装 `next.config.mjs`。
4. 建立 `apps/storybook`、主题 decorator 和 monorepo scripts；先用 Button story 验证 Tailwind token 与两种主题。
5. 为所有当前 `@mewmo/ui` exports 补代表性 stories；只用本地 state/fixtures，不增加业务 mock 层。
6. 补环境变量和本地 smoke 文档，明确与 Langfuse、ZOO-67、Replay/Logs/Chromatic 的边界。
7. 运行 focused tests、Storybook static build、Web/UI lint 和 type-check、unit、theme、root production build。
8. 启动 Storybook 做浏览器验收：浅色/深色、长文本、disabled/loading/danger/error、Dialog/Modal/Dropdown 交互；检查控制台。
9. 检查 `git diff --check`、敏感值扫描与最终 scope，提交、推送中文 PR；不自动 merge。

## Risk And Rollback Points

- `apps/web/src/instrumentation.ts` 与 `next.config.mjs` 是 Web 启动/构建关键点，每完成一层接入立即执行 no-env build smoke。
- `globals.css` 体量大且包含产品页面样式；Storybook 只导入复用，不移动或复制 token，避免本任务扩大为 CSS 架构迁移。
- Sentry SDK 可能增加 client bundle；只启用 error + low-sample tracing，不启用 Replay/Feedback/Logs，并在构建后检查无配置路径。

## Validation Commands

```sh
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/ui lint
pnpm --filter @mewmo/storybook lint
pnpm --filter @mewmo/storybook build
pnpm test:unit
pnpm test:theme
pnpm build
```
