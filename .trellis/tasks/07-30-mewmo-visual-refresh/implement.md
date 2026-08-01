# Implementation Plan

## 1. Protect Existing Work

- [x] 记录工作区状态，确认官网目标文件与 `globals.css` 并行修改区块。
- [x] 限定修改范围，不覆盖 `/mew`、`/today`、Agent、数据库等未提交工作。

## 2. Rebuild Homepage

- [x] 新建客户端能力区与稳定 Demo 工作区组件。
- [x] 重构 `page.tsx` 为 Hero、能力、工作流、Agent、CTA、Footer 六段。
- [x] 更新导航顺序、Globe 控件、GitHub 新窗口链接。
- [x] 更新中英文翻译并保持 key 同构。
- [x] 替换官网 CSS override，完成桌面、移动端、focus 与 reduced-motion。

## 3. Preserve App Theme Change

- [x] `html.light` 语义 token 已替换为中性灰阶。
- [x] 通过 theme 测试确认无暖色回归。

## 4. Focused Tests

- [x] 更新官网静态测试，覆盖结构、Tab 顺序、当前 / 即将支持、导航与无标签 / 无黄色约束。
- [x] 运行 `pnpx tsx --test tests/unit/marketing-landing-static.test.mjs`。
- [x] 运行 `pnpm test:theme`。

## 5. Validation

- [x] `pnpm --filter @mewmo/web lint`
- [x] `pnpm --filter @mewmo/web build`
- [x] 浏览器验收桌面、390px 移动端、Tab 点击、英文切换与横向溢出。
- [x] 运行 `trellis-check` 并对照 PRD 验收。
- [x] 保持本地开发服务可访问；用户视觉确认前不 commit。
