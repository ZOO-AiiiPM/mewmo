# mewmo 开发规范 · 通用

> 本文件由 `agent.md` 抽出的项目专属层。每条规范必须带 why：没有理由的规则会被先验覆盖。

- **TypeScript strict mode**：所有 packages 和 apps 开启 `strict: true`，因为松散类型在多 package monorepo 里会让错误跨包传播。
- **Zod schema 校验所有外部输入**：API 入参、环境变量、第三方返回。定义在 `packages/shared/src/validators/` 里前后端共享。因为 TypeScript 类型只在编译时存在，运行时不校验 = 脏数据进库。
- **深色/浅色是同一套 UI，不是两份颜色补丁**：普通应用界面优先使用 `--ink` / `--ink-soft` / `--ink-faint` / `--canvas` / surface / line / hover / selected 等语义变量，因为颜色的职责是“正文”“辅助文字”“选中态”，不是“永远白色”。新增 `#fff` / `white` / `text-white` 或固定黑色前景会让一个主题正常、另一个主题不可读，所以 `pnpm test:theme` 会拦截这类新增行。品牌图形、图片遮罩、明确反色按钮等与主题无关的固定色是合法例外，但必须在 `tooling/theme-color-allowlist.json` 精确到文件和代码片段并写明理由；分散排除会让白名单逐渐失去审计意义。
