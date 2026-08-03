# ZOO-139 Web 可观测性与 Storybook UI 验收基础

## Goal

让 Web/API 的线上错误可定位、可按环境和发布版本归因，同时让共享 UI 无需登录、数据库或业务页面即可独立验收。两部分共同降低发布后排障和视觉回归成本，但不扩展为通用 telemetry 平台或第二套设计系统。

## Background

- `apps/web/src/instrumentation.ts` 当前只配置 Node.js HTTP 代理，没有应用错误采集。
- Web/API 多处错误仍只写入运行进程的 `console.error`，跨 Vercel、Agent 和 Worker 无法形成应用级错误聚合。
- ZOO-61 已完成 Agent/Workflow 的 Langfuse tracing、usage 与隐私边界；本任务只补 Web/API，不重复 AI tracing。
- ZOO-67 独立负责 Agent loop、token 和用户预算护栏；本任务不实现执行侧成本限制。
- `packages/ui` 当前导出 11 个共享 primitives，但没有隔离运行环境；主题 token 只由 Web 全局样式提供。

## Requirements

### Web/API observability

- 使用官方 `@sentry/nextjs` SDK，覆盖浏览器、Node.js、Edge、Server Component 和全局 React 错误入口；不创建项目内 provider wrapper。
- 保留现有 `instrumentation.ts` 的代理设置，并在同一 Next.js instrumentation contract 中加载 Sentry。
- 仅在 DSN 存在时启用运行时发送；DSN、组织、项目或上传 token 缺失时，本地开发、Preview、业务请求和生产构建均保持可用。
- 支持明确的 environment 和 release；配置完整时上传 source maps，配置不完整时跳过上传而不是使构建失败。
- 默认关闭 Session Replay、用户反馈和 Sentry logs；一期只采集错误与低采样 tracing，避免扩大隐私面和数据量。
- `sendDefaultPii=false`、禁用 HTTP body 收集，并在统一 `beforeSend` 边界递归移除认证头、Cookie、密码/密钥/token、正文/content/body、prompt/messages、Tool arguments/results 等敏感字段。
- 脱敏逻辑必须是可单测的纯函数；不得把真实 DSN、上传 token、笔记正文或用户凭据写入仓库、测试快照和日志。

### Storybook UI workshop

- 新增独立 `apps/storybook` workspace，使用官方 Storybook 10 的 Next.js + Vite framework，直接消费 `@mewmo/ui`。
- 复用 Web 现有 Tailwind/global theme token，不复制组件实现或建立第二份颜色变量。
- 提供工具栏浅色/深色切换，story canvas 必须真实应用 `html.light` / `html.dark`。
- 为 `packages/ui/src/index.ts` 当前导出的 Button、Input、Textarea、Select、Dialog、Toast/ToastContainer、Dropdown/DropdownItem、Modal、Card、Badge、Spinner 提供代表性 stories。
- 适用组件覆盖默认、disabled/loading、danger/error、长中文文本和可交互弹层状态；stories 不访问真实网络、认证或数据库。
- Storybook 静态构建纳入 monorepo `build` contract，并提供独立的本地启动命令。

### Documentation and compatibility

- 文档说明 Sentry 环境变量、隐私边界、fail-open 行为、手动 smoke 步骤，以及 Storybook 启动/构建方式。
- 保持 Next.js 16、React 19、pnpm/Turborepo、NextAuth、Langfuse 和现有 Vercel Preview 行为兼容。

## Acceptance Criteria

- [ ] 配置测试 DSN 时，可按官方 smoke 步骤分别验证浏览器异常和 server/API 异常，并看到正确 environment、release 与可读调用栈。
- [ ] 不配置任何 Sentry 变量时，Web dev、type-check 和 production build 通过，且 SDK 不发送事件。
- [ ] focused tests 证明嵌套的敏感 headers、正文、prompt、Tool payload 被移除，非敏感定位字段保留。
- [ ] Storybook 可启动，侧栏能访问所有现有共享 UI primitives；浅色/深色切换真实改变组件 token。
- [ ] Dialog、Modal、Dropdown 等交互 story 可操作；长文本、disabled/loading、danger/error 场景无溢出和控制台错误。
- [ ] Storybook 静态构建、Web lint/type-check、相关 unit、theme 和 production build 全部通过。
- [ ] 仓库文档列出配置、验证步骤和与 Langfuse/ZOO-67 的职责边界。

## Out Of Scope

- 不创建、配置或写入外部 Sentry 组织、项目、真实密钥和告警规则。
- 不启用 Session Replay、用户反馈、Sentry Logs、全量 trace 或用户正文采集。
- 不接入 OpenTelemetry Collector、Grafana、Better Stack、Chromatic 或其他托管视觉回归服务。
- 不重做组件视觉、不迁移业务页面、不增加产品内调试入口。
- 不重复 Langfuse AI tracing，不实施 ZOO-67 的 Agent 成本护栏。
