# mewmo 开发规范 · 前端（Web）

> 本文件由 `AGENTS.md` 抽出的项目专属层。每条规范必须带 why。

- **列表虚拟滚动**：笔记/剪藏/订阅条目列表用 `@tanstack/virtual` 虚拟渲染。因为用户可能有几千条数据，全量渲染 DOM = 滚动卡顿。
- **列表只加载摘要**：API 返回 240 字 preview，不返回全文。点进详情才加载全文。
- **所有 `dangerouslySetInnerHTML` 必须走现有 sanitize 链路**：剪藏内容来自外部网页，不过滤 = XSS。当前清洗实现主要在 `apps/web/src/lib/clip-content.ts`，不要引用不存在的 shared util。
- **乐观更新（Optimistic UI）**：用户操作立刻更新本地 UI，不等服务器返回。失败时回滚。因为等网络 = 用户感知到延迟。
- **图标沿用 `apps/web/src/components/shell/PrototypeIcon.tsx` 的本地 SVG 系统**：当前项目没有 `@iconify/react` 或 Solar 离线包，不能按旧规划引入运行时 CDN。未选中态与激活态继续使用现有 line/fill 双态逻辑；新增图标先复用现有 key，确需新增时在同一组件内补齐并保持离线可用。
- **编辑器的视觉隐藏必须连同键盘路径验收**：Milkdown/CodeMirror node view 即使被 CSS 隐藏仍可能持有选区或焦点，因此 preview-only 等模式必须验证 Enter/方向键能退出块、可见编辑态不受影响，并遮住懒挂载 placeholder；否则会出现不可见输入和切页源码闪帧。
- **编辑器结构操作不能复用样式菜单的 selection 假设**：菜单打开时锁定目标结构 range，再由删除等动作使用该 range；危险操作的 CSS specificity（选择器权重）必须不低于基础行样式，固定 footer 还要在高缩放和短视口下保持可见，否则会出现点击无效、危险色被覆盖或操作项被滚动容器裁掉。
- **Crepe 异步 preview renderer 不能用全局 latest-token 丢弃旧请求**：同一个 config renderer 会服务页面内所有代码块，而 `applyPreview` 每次 watch 都会重建，既不是稳定 block identity，也不能跨调用分组；全局 generation 会让较早代码块永久停在 loading。无真实 block identity 时应串行提交 render，确保每个块完成且后发更新最后落地。
- **共享 UI primitive 必须在 `apps/storybook` 有代表性 story**：story 直接从 `@mewmo/ui` 导入组件并复用 Web `globals.css`，至少覆盖该组件的交互和错误/危险状态；主题切换必须落到 preview iframe 的 `html.light` / `html.dark`。因为隔离环境才能在不依赖登录和数据库的前提下暴露全局 CSS specificity、主题 token 和弹层交互回归。
