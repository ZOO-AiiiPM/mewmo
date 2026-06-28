# Web 登录页 Turbopack 把 undici 打进浏览器导致 node:net 报错

- **症状**：打开 Web 登录页时浏览器报 `Cannot find module 'node:net': Unsupported external type Url for commonjs reference`，堆栈指向 `undici/lib/dispatcher/client.js`，HMR runtime 在浏览器侧加载失败。页面看起来像登录页没完成，但真正炸点在打包链路。
- **根因**：`apps/web/src/instrumentation.ts` 顶层静态 `import { setGlobalDispatcher, ProxyAgent } from "undici"`。Next 16 默认 Turbopack 会为 instrumentation 生成 edge/browser 相关 bundle，静态 import 让 `undici` 进入非 Node bundle；`undici` 内部依赖 `node:net`，浏览器侧无法解析。另一个叠加问题是 `next.config.mjs` 里加了 `webpack` 配置，Next 16 Turbopack build 会直接拒绝这种配置。
- **修法**：
  - `apps/web/src/instrumentation.ts` 只在 `process.env.NEXT_RUNTIME === "nodejs"` 分支里动态 `await import("undici")`，避免 edge/browser 编译阶段解析 Node-only 模块。
  - `apps/web/next.config.mjs` 删除自定义 `webpack` 分支，保留 `serverExternalPackages`。
  - `apps/web/src/lib/auth.ts` 修正 NextAuth lazy handlers 的类型，避免 `/api/auth/[...nextauth]` 在 Next 16 构建类型检查中失败。
  - `packages/auth/src/auth.test.ts` 更新 provider 断言，承认当前登录方式包含 `credentials`。
- **关联文件**：
  - `apps/web/src/instrumentation.ts`
  - `apps/web/next.config.mjs`
  - `apps/web/src/lib/auth.ts`
  - `packages/auth/src/auth.test.ts`
  - `tests/scaffold.test.mjs`
- **验证**：
  - `pnpm test` 通过
  - `pnpm lint` 通过
  - `pnpm --filter @mewmo/web build` 通过
  - `http://localhost:3000/login` 返回 200
  - 登录页浏览器脚本里查不到 `undici` / `node:net`
  - `/api/login` 对错误账号返回 `401 {"error":"Invalid email or password"}`
- **日期**：2026-06-28

## 踩坑记录

- 浏览器侧报 Node 内置模块缺失时，不要只盯当前页面组件；先搜全项目谁 import 了对应 Node-only 包。这次登录页本身已经不 import server auth，但 instrumentation 的静态 import 仍会污染浏览器 bundle。
- Next 16 默认 Turbopack，旧式 `webpack` 配置不是无害兜底；如果只是为了 server-only package 外置，优先用 `serverExternalPackages`。
- instrumentation 这种跨 runtime 入口必须把 Node-only 依赖放进 Node runtime 分支的动态 import，不能顶层静态 import。
