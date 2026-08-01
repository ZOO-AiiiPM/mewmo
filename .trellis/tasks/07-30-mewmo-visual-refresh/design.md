# Technical Design

## Design Intent

mewmo 面向持续收集、加工并复用知识的人。官网通过黑、白、灰三种全宽背景建立清晰章节，并把“同一个 Demo 工作区在不同能力下持续变化”作为唯一 signature element。

## Visual System

- Black `#0a0a0a`: Hero 与 Agent 高潮。
- White `#ffffff`: 基础能力与 CTA。
- Fog `#f2f2f2`: 自动工作流。
- Ink `#111111`: 浅色主文字。
- Muted `#737373`: 次级文字。
- Hairline `#d8d8d8`: 结构边界。
- 使用现有系统字体栈，不加载外部字体或 CDN。

## Component Boundaries

- `LandingPage`: 服务端组件，读取 `marketing` 翻译并组合导航、Hero、Agent、CTA 与 Footer。
- `MarketingCapabilitySection`: 客户端组件，负责两组单选 Tab、键盘导航及 Demo 状态切换。
- `DemoWorkspace`: 受控 HTML/CSS 产品画面，根据 `note / clip / feed / library / summary / insight / related / agent` 状态展示不同内容；所有状态共享稳定几何。
- `LocaleSwitcher`: 保留 locale action，只把现有“文/A”视觉换为 Globe icon。
- `globals.css`: 官网样式限定在 `.mewmo-marketing-page` 命名空间内；保留同文件其他未提交规则。

## Page Structure

```text
nav: logo                            globe · login · register · GitHub

hero / black
  brand + slogan                              Demo(note + mew)

capabilities / white
  vertical tabs                       copy + Demo(active capability)

workflows / light gray
  vertical tabs                       copy + Demo(active workflow)

agent / black
  centered thesis
  full-width Agent run
  upcoming progression

closing / white
  one sentence + register

footer
```

## Interaction

- Tab 使用 `role=tablist/tab/tabpanel`，支持点击、左右 / 上下箭头、Home、End。
- Tab 内容用 React 本地 state 切换，Demo 画布固定 aspect ratio，避免 layout shift（布局跳动）。
- Hero 元素使用一次性 CSS 进入动画；Agent 流程用有节奏的静态序列和轻微 reveal。
- `prefers-reduced-motion` 下移除动画与 smooth scroll。

## Compatibility

- 保持 Next.js server page、`next-intl`、现有 auth 路由和 locale action。
- GitHub 使用外部 `<a>`，带 `target="_blank"` 与 `rel="noreferrer"`。
- Demo 不依赖截图或外部资源，避免旧标签 UI、私人数据与 CDN 风险。
- App 只修改 `html.light` 语义 token，不修改主题 hook 或 dark token。

## Rollback

- 官网页面、客户端组件、翻译、样式和测试可按文件独立回退。
- App 颜色回退只需恢复 `html.light` token 原值，不涉及数据迁移。
