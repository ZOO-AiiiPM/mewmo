import { defineConfig } from 'vitest/config'

// vitest 配置 — Phase 0 vault + wiki 架构骨架（spec 002-vault-wiki-foundation）
//
// 注意：mewmo 的核心单元测试在 Rust 端（cargo test，spec SC-013 IO 层 100% 覆盖）。
// vitest 只覆盖前端 TS lib（vault.ts / frontmatter.ts 等 thin wrapper），不渲染组件，
// 所以默认 environment: 'node' 不需要 jsdom。

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src-tauri', '.playwright-cli'],
  },
})
