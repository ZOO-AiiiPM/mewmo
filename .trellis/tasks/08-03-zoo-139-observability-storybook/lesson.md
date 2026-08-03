# Lessons: ZOO-139 Web 可观测性与 Storybook UI 验收基础

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- Sentry 的 no-config 路径必须是真正 no-op：无 DSN 不初始化；上传 token/org/project 任一缺失时不包装 Next build。这样本地、Preview 和无遥测环境不会因监控配置失败。
- SDK 的 `sendDefaultPii=false` 不是产品隐私边界的替代品；笔记正文、prompt/messages 和 tool payload 仍需在共享 `beforeSend` 纯函数递归过滤，并用单测锁定。
- Storybook 直接消费 `@mewmo/ui` 并复用 Web 全局 CSS，能提前暴露全局元素规则压过 Tailwind utility 的问题；共享 primitive 的交互、危险状态和两种主题应在此验收。
- `storybook-static/` 是构建产物；若共享 ESLint ignore 未覆盖它，`build -> lint` 会扫描压缩 bundle 并产生大量假失败。生成目录必须在 lint 入口统一排除。
- 本次 pnpm 镜像可用的统一 Storybook 版本为 10.5.5；`tsconfck@3.1.6` 的 peer 范围尚未声明 TypeScript 6，但 lint、type-check 和静态构建均通过，暂不为元数据告警降级 TypeScript。
