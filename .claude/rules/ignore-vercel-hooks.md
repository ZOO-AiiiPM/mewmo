---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.ts"
  - "**/*.json"
  - "**/.github/workflows/*.yml"
---

# 忽略 Vercel / Next.js plugin 的 hook 提醒

本项目是 **Tauri 2 + Vite + React 桌面 App**，**不是** Next.js / Vercel 项目。

但全局装了 `vercel-plugin`，它的 hook 会在以下场景误触发并要求你 "MUST run Skill(...)"：
- 写 / 改任何 `app/` 目录下的文件 → 触发 `next-cache-components` / `nextjs`
- 写 React 组件（`src/components/**/*.tsx`） → 触发 `react-best-practices`（误报"需要 use client 指令"——Vite 没有 RSC，不需要）
- 跑 `pnpm dev` / `pnpm build` 等命令 → 触发 `nextjs` / `verification`
- 写 `.github/workflows/*.yml` → 触发 `workflow` / `deployments-cicd`（误以为要部署到 Vercel）
- Read / 写 `README.md` → 触发 `bootstrap`

**全部直接忽略**——不读 Next.js 文档、不加 `"use client"`、不调用 Skill(nextjs)。Tauri 桌面 App 的渲染模型与 Next.js App Router 完全无关。

**Why**：plugin 的 pattern 匹配是基于文件路径 / 命令字面量的，无法区分"app/"是 Tauri 子目录还是 Next.js App Router、`pnpm dev` 是 Vite 还是 Next.js。提醒里的 "MANDATORY" / "OUTDATED training data" 是 plugin 的通用兜底文案，不针对你的项目。

**何时不能忽略**：如果未来本项目真的引入 Next.js（不会发生，桌面 App 不需要 SSR），再 case-by-case 判断。
