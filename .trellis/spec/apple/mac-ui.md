# macOS 端 UI 对照规范（Mac SwiftUI · 单一真相源）

> **目的**：把当前 Web 工作区的结构、视觉 token、交互状态与键盘行为整理成可追溯的 macOS SwiftUI 实现规范，使 ZOO-94/96/97 无需凭截图重新做产品决策。
> **范围**：只描述 Mac 桌面端的 SwiftUI 交付目标。Web 是证据源（每条规则回链 `origin/main` 源码与行号），不是被改动的对象。本文件不包含 SwiftUI 业务代码，也不修改任何 Web 源码。
> **基线**：本文件的源码锚点对应 `origin/main` 上的 `ede90619`（ZOO-89 合入后）。引用路径与行号必须回查源码，见 §13 漂移核对方法。

## 1. Scope 与术语

### 1.1 目标交付（In scope）

- Mac 桌面应用的窗口、分栏 shell、导航与列表/详情/编辑器/阅读器结构。
- 与 Web 一致的深色主题 token，以及 Mac 独有的纯黑白灰浅色 token 映射。
- 顶部 tab strip（Apple 增强）及其独立页面状态。
- notes / clips / feeds / feed entries 各自的 loading / empty / error / selected / offline-stale 状态语义。
- 窗口、菜单、焦点、键盘、VoiceOver 与 reduced motion 规则。

### 1.2 明确排除（Out of scope）

- AI / chat / 浮动 AI 入口（`AISidebar`、`mewmo-ai-*`、`/mew`、`/chat`、`/today`）。
- iPhone / iPad 完整交互规范（仅定位为与 Mac 共享 core，见 ZOO-87）。
- SwiftUI 业务界面或 preview 实现；Web UI 重构、截图基线、设计稿。
- 数据层 / auth / 同步 / 图片缓存实现。
- 认证页（`--auth-*` 暖黄 token）不作为视觉基准。

### 1.3 术语

| 术语 | 含义 |
|------|------|
| Web parity | 行为与 Web 现状一致，需回链 Web 源码 |
| Semantic parity | 语义一致但形态可随 macOS 原生习惯调整 |
| macOS native | 由 macOS 原生框架（NSWindow/NSMenu/SwiftUI 系统组件）提供，无 Web 对应物 |
| Apple enhancement | Mac 产品新增能力，Web 无此行为，不得伪装成 Web 现状 |
| tab strip | 窗口内 workspace 顶层 tab 条（见 §4） |

### 1.4 映射标注规则

每个规范小节明示同类目：**Web parity / Semantic parity / macOS native / Apple enhancement**。原则：能用原生焦点、菜单、窗口行为就用原生（避免像素级复刻 Web），结构、信息架构与状态矩阵保持与 Web 一致。

## 2. 窗口与分栏模型

### 2.1 Web 现状（证据）

Web shell 是「三区 + 可选 AI rail」的 CSS grid，证据于 `apps/web/src/app/globals.css`：

- `.mewmo-shell` 网格：`grid-template-columns: var(--sidebar-w) minmax(0, 1fr) 0px`，`--sidebar-w: 206px`，`--frame: 6px`，整页 `100vh`。【globals.css:661-667】
- `mewmo-shell--ai-open` 把第三列扩为 `var(--ai-w)`（默认 `AI_W_DEFAULT = 320`，min `280`，阅读区地板 `READ_W_FLOOR = 460`）。【AppShell.tsx:30-39】【globals.css:857-858】
- Sidebar 附着在 shell 上（grid col 1），`margin: var(--frame)` 内镶 6px 缝隙、`background: rgba(22,23,25,0.6)` + `backdrop-filter: blur(20px) saturate(1.4)`、圆角 16px。【globals.css:887-915】
- 工作区（main 内）是「list column + reader」两栏 grid：`.mewmo-workspace { grid-template-columns: 312px minmax(0, 1fr) }`。【globals.css:1544-1552】
- `.mewmo-list-column` 宽 `calc(312px - var(--frame))`、圆角 16px、背景 `var(--s3)`。【globals.css:1565-1579】
- 列表栏可用户手动折叠：`.mewmo-workspace--list-collapsed { grid-template-columns: 0 minmax(0, 1fr) }`，由 `NoteEditorPage`/`ClipsPage` 的 `listCollapsed` state 控制。【globals.css:1554-1563】【NoteEditorPage.tsx:147,650-651】
- Sidebar 也可折叠为 18px 竖条 + 边缘 hover peek。【globals.css:870-871,914-939】【AppShell.tsx:79-107】

### 2.2 Mac 映射

| # | Rule | 类目 |
|---|------|------|
| W-1 | 主窗口是单窗口单文档工作区，对应 Web 的 `AppShell` 结构（sidebar + list + reader），**不**做系统级多窗口 tabbing。 | Semantic parity |
| W-2 | 三区固定默认宽度可在 Mac 上使用原生侧栏宽度记忆（`NavigationSplitView` 或自定义 `NSWindow` min/max content div）实现；默认侧栏 206pt、列表栏 312pt、布局缝隙 6pt，与 Web 对齐。 | Semantic parity |
| W-3 | 列表栏折叠与侧栏折叠保留为语义能力（对应 Web 的 `listCollapsed` / `sidebarCollapsed`），但触发方式用原生（见 §9 键盘/§10）。hovers 展开 Web 的「鼠标贴边 peek」在 Mac 上不作为必需（`macOS native` 由窗口边缘/菜单承担）。 | Semantic parity |
| W-4 | 窗口最小尺寸：内容不能低于阅读区地板 460pt（Web `READ_W_FLOOR=460`）。Mac 建议窗口最小宽 ≥ 990pt（侧栏 206 + 列表 312 + 阅读地板 460 + 布局缝隙 12），高 ≥ 480pt，并允许 `fullSizeContentView` 不影响三栏。 | Semantic parity |
| W-5 | Web 无「reduced motion」三态切换，但 `prefers-reduced-motion: reduce` 全局把动画/过渡时长压到 0.001ms。【globals.css:8310-8314】Mac 用 `@Environment(\.accessibilityReduceMotion)` 等价实现（见 §11）。 | Web parity |

### 2.3 档位（compact / regular / wide）

Web 用的是 CSS breakpoint（媒体查询 @media max-width 在 【globals.css:581,812,2600,8148…】），这不应照搬为 macOS 行为。Mac 定义三种**窗口档位**，基于可用宽度 `W`：

| 档位 | 判定 | 行为 |
|------|------|------|
| compact | 可用宽 < 断点 | 侧栏折叠为图标/纵向条；列表栏按需折叠（语义保留 Web 的 `listCollapsed`） |
| regular | 可用宽 ≥ 断点且侧栏+列表可并排 | 默认三栏（侧栏+列表+阅读） |
| wide | 可用宽很大 | 阅读区加宽，列表栏保持 312pt，阅读区不设硬上限但尊重排版行宽（见 §3 字体/行宽） |

断点建议用原生窗口宽度（`NSScreen` 有效工作区）换算 ≈ 990pt split。**不得**把 Web 的 CSS 媒体查询数值当 Mac 断点；档位只描述语义能力，具体断点由 ZOO-94/96/97 在实现时用原生布局 `horizontalSizeClass` / window width 换算。

## 3. 主题与设计 token

### 3.1 深色 token（Web 现状 = 事实源）

Web 深色为 `:root`（`color-scheme: dark`）一组语义变量，全部是中性灰阶，**无暖色**【globals.css:30-68】：

| token | 值 | 用途 |
|-------|-----|------|
| `--canvas` | `#232327` | 窗口底色 |
| `--s1` | `#161719` | 面板第一层 |
| `--s2` | `#1c1d20` | 第二层 |
| `--s3` | `#0c0c0e` | 第三层（最深的列表/阅读面板底） |
| `--raised` | `#2e2f34` | 抬升面板 |
| `--hover` | `#27282d` | hover 背景 |
| `--selected` | `#2e2f34` | 选中背景 |
| `--ink` | `#ededf1` | 正文 |
| `--ink-soft` | `#9a9aa1` | 次级文字 |
| `--ink-faint` | `#67676d` | 弱文字 |
| `--line` | `#494a52` | 边框/分隔 |
| `--accent` | `#ededf1` | 强调（白） |
| `--accent-ink` | `#161719` | 强调上的文字 |
| `--hl` | `rgba(255,255,255,0.16)` | 高亮遮罩 |

注意 `--coral: #e88478`（`@theme` 内）是主题外的强调红，Web 用于少量危险/收藏等色块【globals.css:11】；Mac 仅在确有 Web 对等语义（danger，`--auth-danger`/danger button）时使用，不作为浅色主色。

### 3.2 浅色 token（Mac 专属 · 纯黑白灰）

Web 工作区浅色 `.light` 已经是中性灰阶【globals.css:70-90】，但 Web **认证页**的 `--auth-*` 是暖黄/米色/奶油（`#f3eee5`、`#fffaf0`、`#f4efe6`、`#f3eee5`…）【globals.css:116-163】。**Apple Mac 浅色模式必须收敛为纯黑白灰，禁止出现暖黄、米色、奶油色主色。**

| Mac 浅色 token | 值（建议映射） | 职责 |
|----------------|----------------|------|
| `canvas` | `#f7f7f7` | 窗口底色（对齐 Web `.light --canvas`） |
| `s1/s2` | `#f7f7f7` | 面板层 |
| `s3/raised` | `#ffffff` | 最浅面板/阅读/列表底 |
| `hover` | `#f1f1f1` | hover 背景 |
| `selected` | `#e8e8e8` | 选中背景 |
| `ink` | `#1d1d1f` | 正文 |
| `ink-soft` | `#5e5e64` | 次级文字 |
| `ink-faint` | `#9a9aa0` | 弱文字 |
| `line` | `#d8d8d8` | 边框/分隔 |
| `accent` | `#1d1d1f` | 强调（黑） |
| `accent-ink` | `#ffffff` | 强调上的文字 |
| `hl` | `rgba(0,0,0,0.09)` | 高亮遮罩 |

映射依据：直接对齐 Web `.light` 同名词 token（【globals.css:72-89】），浅色只做黑白灰到 SwiftUI `Color`/`AnyShapeStyle` 语义一栏，**不**照搬 `--auth-*` 暖色。校验：视觉审查中浅色模式主色面出现任何暖黄/米色/奶油即视为阻塞 bug。

### 3.3 字体与字号（Web 现状）

- 系统 sans：`-apple-system, BlinkMacSystemFont, "PingFang SC", …`（`--ui`）。【globals.css:51-53】
- serif：`"New York", ui-serif, "Songti SC", Georgia, serif`（`--serif`）。【globals.css:54】
- mono：`ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`（`--mono`）。【globals.css:55】
- 正文基准 14px、行高 1.5；阅读区（`--reader-font-size: 15.5px`）。【globals.css:104-105,57】
- 列表卡片标题 15px(font-weight 750)。【globals.css:1595-1608】

Mac 映射：直接使用 SwiftUI 系统字体（`.body`/`.callout`/`.headline`），中文 PingFang SC 由系统提供，与 Web `--ui` 一致。阅读区字号默认 15.5pt 可设全局字号偏好。

### 3.4 间距、边框、圆角、阴影（Web 现状）

- 圆角：`--radius-sm: 4px / --radius-md: 8px / --radius-lg: 12px / --radius-full: 999px`，面板用 16px。【globals.css:20-23,1544,1573】
- 缝隙：shell 面板 `margin: var(--frame)`，`--frame: 6px`。【globals.css:662,886】
- 阴影：面板 `0 1px 6px / 0 4px 16px rgba(0,0,0,0.04)`。【globals.css:1575-1577】浮动（弹层）`--shadow-float: 0 2px 16px rgba(0,0,0,0.28)`。【globals.css:18】
- 状态背景：hover/selected 用语义 `--hover`/`--selected`（【globals.css:37-39】），不写固定色。

Mac 映射：用 SwiftUI 内建 shape/style（`RoundedRectangle(cornerRadius:)` 12/16、`.stroke(.separator)`、`.shadow`），hover/selected/focus 用系统语义色（`Color(nsColor: .controlBackgroundColor/.selectedContentBackgroundColor)`）——这些是 Semantic parity，但数值对齐 Web 圆角/缝隙，保证视觉基调一致。

## 4. 顶部 tab strip 与独立页面状态（Apple enhancement）

这是 Apple 专属产品增强，**不是** Web parity，也不等价于 macOS 系统多窗口 tabbing。

### 4.1 形态

- 窗口顶部一条 tab strip：每个 tab 显示标题 + 可选图标（不同页面用不同图标以区分根路由：notes / clips / feeds / feed entries / 其它）。
- 第一个固定为「+」新建按钮（对应 `+` tab），点击新建一个 workspace tab。
- tab 可切换（点击激活）、可关闭（x / ⌘W 对激活 tab；或右键菜单关闭），激活 tab 高亮。
- 溢出策略：tabs 过多时横向滚动或滚动箭头收缩，不撑破窗口；所有 tabs 仍通过 `⌘+数字` / tab 切换顺序可达（见 §9）。
- 每个 tab 拥有独立页面状态：路由/根页面 id + 该页导航选择（list 选中项、滚动/搜索 query、列表折叠态）。切换 tab 不覆盖另一 tab 的上下文（如同 Web 每个 URL 页面各有自己的 `useState` 选择，见 NoteEditorPage 的 `selectedSlug`（【NoteEditorPage.tsx:141-147】）与列表/阅读分别保留）。

### 4.2 状态图

```
状态：ActiveTab | Closed | Overflow
事件：
  + 新建            → append new tab, activate it
  点击 tab           → switch active tab (保持其页面状态)
  关闭 tab           → 移除；若关闭的是激活 tab，激活其右侧邻居（无右侧则左侧）
  切换 tab           → 保留各自页面状态（不重置）
  窗口关闭（正常）    → 持久化全部 tab descriptors + active id
  窗口重开（正常）    → 恢复 tabs + active id（§4.3）
  退出登录/切换账号   → 清空当前 scope 的 tab 状态（§4.4）
  目标内容被删/失效   → 该 tab 降级为 unavailable state，可关闭，其余 tabs 继续恢复（§4.5）
```

### 4.3 持久化恢复

- 只持久化**版本化的 Codable tab descriptors**（根页面 id + 标题/图标描述 + 页面选择状态），**不持久化视图对象**。
- 正常重启（非崩溃）后恢复 tabs 与 active tab id；崩溃/异常也不应因恢复失败而拒绝启动（恢复失败 = 以空 workspace 启动）。
- 恢复顺序：先按 active id 恢复当前 tab，其余 tabs 按原顺序恢复。

### 4.4 账号 scoped 清除

- tab 状态按已认证账号 scope 持久化。**退出登录或切换账号时清空该 scope 的 tab 持久化**，激活新账号后以空 workspace 起步，禁止恢复前一账号 tabs（对应 Web `WorkspaceAccountProvider userId` 各账号数据隔离语义，见 AppShell【AppShell.tsx:221】）。

### 4.5 宽容降级

- 单个 tab descriptor 无法解码（版本不符、字段缺失）→ 跳过该 tab（其余继续恢复），不丢弃整份 workspace。
- 目标内容已删除或不可达 → 该 tab 以可关闭的 unavailable placeholder 显示，不阻塞启动、不崩溃。
- 验收清单见 §12。

## 5. 导航与选中

### 5.1 Web 现状

- Sidebar 承载导航层级（品牌、分组、feeds drill-in、knowledge、账号控制），【Sidebar.tsx】结构与 sidebars 的 section。
- 列表选中由各页面自持：notes 的 `selectedSlug`（【NoteEditorPage.tsx:141-147】），clips 的 `selectedClipId`（【clips/page.tsx:122】），feeds 的 `effectiveFeedId + selectedEntry`（【feeds/page.tsx:142,~306】）。
- 导航会写入 URL（`pushStableSelectionUrl`），goback/forward（`popstate`）恢复选择。【NoteEditorPage.tsx:326-335,499-506】
- Sidebar 支持 drill-in（如 feeds → 单 feed → feed entries），见 `mewmo-sidebar__stage--drilled`。【globals.css:1143-1198】

### 5.2 Mac 映射

| # | Rule | 类目 |
|---|------|------|
| N-1 | 主导航用原生 sidebar（`NavigationSplitView` sidebar 或自定义 `List`），与 Web 侧栏信息架构一致（分组/收藏/订阅 drill-in/账号）。 | Semantic parity |
| N-2 | 列表选中项是每页自持的导航选择；tab 切换不得覆盖（见 §4.1）。 | Web parity |
| N-3 | 浏览器 back/forward 恢复选择，在 Mac 上由侧栏/列表选择与「返回上级」等价语义承担（`NavigationSplitView` 自动）；不引入 Web 的 URL popstate。 | Semantic parity |
| N-4 | 删除当前选中项 → 选中列表中的下一条（无则空态），与 Web 一致（`remaining[0]`）。【NoteEditorPage.tsx:512-517】 | Web parity |

## 6. Notes 状态矩阵

证据源：`apps/web/src/app/(app)/notes/page.tsx` → `NoteEditorPage.tsx`。结构 = `ListColumn(笔记)` + `mewmo-reader-surface`(toolbar + toc + editor)。【NoteEditorPage.tsx:650-806】

| 状态 | Web 表现 | Mac 映射 |
|------|----------|----------|
| loading 列表 | `ListContentSkeleton active variant="text"`【NoteEditorPage.tsx:668-669】 | 原生 `.redacted(reason:)` + placeholder |
| loading 详情/编辑器 | `ReaderContentSkeleton`【NoteEditorPage.tsx:777-778,795-796】 | `.redacted` + editor loader |
| error 列表 | `mewmo-list-empty` + icon + 文案 `Could not load notes.`【NoteEditorPage.tsx:670-674,260-262】 | 空态面板 + 可重试 |
| empty 列表（无选择） | `mewmo-document--empty`「选择一条笔记 / 新建一条笔记」【NoteEditorPage.tsx:798-801】 | 同文案空态 |
| selected（无详情） | `NoteEditor` 骨架挂起 | editor loading |
| selected（有详情） | 编辑器 `NoteEditor` 编辑中 | SwiftUI 编辑器（Semantic parity，编辑器本身是内容编辑，不做像素复刻） |
| offline/stale | Web 用 `workspace-data-cache` 秒开缓存回填【NoteEditorPage.tsx:120-157,158-222】；未实现离线写入而非现状 | Mac 用本地缓存展示旧内容 + 标注 stale（对应 §10） |

命令：新建笔记（`handleNewNote`）、删除、置顶、分享、导出 Markdown、复制全文。【NoteEditorPage.tsx:337-357,508-586】

## 7. Clips 状态矩阵

证据源：`apps/web/src/app/(app)/clips/page.tsx`。结构 = `ListColumn(剪藏)` + reader（toolbar + `ClipContentRenderer`）。【clips/page.tsx:377-529】

| 状态 | Web 表现 | Mac 映射 |
|------|----------|----------|
| loading 列表 | `ListContentSkeleton`【clips/page.tsx:378-379】 | `.redacted` placeholder |
| error 列表 | `mewmo-list-empty` + `error` 文案【clips/page.tsx:380-383】 | 空态 + 重试 |
| empty 列表（无剪藏） | `mewmo-list-empty`【clips/page.tsx:386】 | 空态 + 「新建剪藏」入口 |
| queued/fetching | 列表卡片同步角标 `mewmo-sync-status`【clips/page.tsx:441-443】；详情骨架【clips/page.tsx:496-497】 | 进度指示/`redacted` |
| fetch error | 卡片 `mewmo-sync-status--error` 抓取失败【clips/page.tsx:444-446】 | 卡片错误角标 + 可重试 |
| selected | `ClipContentRenderer` 渲染清洗后 HTML【clips/page.tsx:520-524】（sanitize 链 `apps/web/src/lib/clip-content.ts`，见 dev-frontend） | 原生 web/content 渲染（Semantic parity；剪藏正文按 Web 清洗结果渲染） |
| 检查更新 | `refreshClip` → toast 失败【clips/page.tsx:~354】 | 工具栏「检查更新」 |

## 8. Feeds / Feed entries 状态矩阵

证据源：`apps/web/src/app/(app)/feeds/page.tsx`；`feeds/[id]` 是重定向兼容页（`/feeds?type&feedId`）【feeds/[id]/page.tsx:13-34】；`feed-entries/[id]` 是条目详情。结构 = 侧栏 feeds drill-in（`mewmo-sidebar__stage--feed`【globals.css:1175】）+ feeds 列表（类型 tabs: article/media/video/podcast）+ feed entries + reader。

| 状态 | Web 表现 | Mac 映射 |
|------|----------|----------|
| loading | `isLoading` 列表骨架 | `.redacted` |
| error | 列表顶部 `text-coral` 错误【feeds/page.tsx:413-414】 | 空态/错误横幅 + 重试 |
| empty | `getFeedEmptyState`【lib/feed-status.ts:62】按 feedId/selectedFeed/feedsLoaded 派生标题/详情/`canRefresh`【feeds/page.tsx:168-173,420-423】 | 同语义空态（标题/详情可选「检查更新」） |
| selected feed | `effectiveFeedId` + `selectedEntry`，URL `?type&feedId`【feeds/page.tsx:142,229-235】 | 列表选择（Semantic parity） |
| 检查更新 | feed 级 refresh【feeds/page.tsx:333】 | toolbar「检查更新」 |
| 收藏失败 | toast【feeds/page.tsx:372】 | toast/错误提示 |
| unavailable（内容删） | feed 侧栏 drill-in；条目 404 → 空态 | 对应 §4.5 unavailable 或列表空态 |

## 9. Toolbar、菜单、键盘、焦点

### 9.1 Toolbar（Web 现状 → Mac）

- 列表栏 header：标题 + 搜索 + 剪藏 URL 输入 + 新建按钮（`ListColumn`）。【ListColumn.tsx】每个页面的 action 图标不同（notes `pen-new-square`、clips 剪藏）。
- 阅读器 toolbar：`ReaderToolbar`——左侧 nav（列表折叠/返回）、中间标题（滚动后浮现，`useReaderToolbarTitleVisibility`）、右侧工具组（删除/置顶/分享/复制/导出/菜单）。【NoteEditorPage.tsx:747-765】【globals.css:2488-2546】
- Mac 映射：用原生 `.toolbar`——左侧（macOS native back/列表折叠）、标题 toolbar item、右侧工具组。危险操作（删除）放 `Menu`/右键与确认弹窗（macOS native）。

### 9.2 菜单（macOS native，新增）

| 菜单 | 内容 |
|------|------|
| 应用菜单 | About、Hide/Quit（标准） |
| File | New Tab（`⌘T`）、Close Tab（`⌘W`）、新建笔记/剪藏/订阅（对应 Web 各新建动作） |
| Navigate | 上一选择/下一选择（对应 Web popstate 顺逆，macOS native）、切换列表折叠 |
| View | 切换浅色/深色/自动（遵循系统）、字号、进入全屏 |
| Window | 标准窗口列表 |
| Tab | 下一个/上一个 tab（`^⇥`/`^⇧⇥`）、`+` 新建、tab 数字切换（`⌘1`…`⌘9`） |

### 9.3 键盘与焦点

| 绑定 | 语义 | 类目 |
|------|------|------|
| `⌘T` | 新建 tab | Apple enhancement |
| `⌘W` | 关闭激活 tab；最后一 tab 关闭时保持空 workspace（或退出窗口由实现定） | Apple enhancement |
| `^⇥` / `^⇧⇥` | 下一个/上一个 tab | Apple enhancement |
| `⌘1…⌘9` | 切到第 N 个 tab | Apple enhancement |
| `⌘N` | 新建笔记 | Semantic parity |
| `⌘F` / 列表搜索聚焦 | 等价 Web 列表内搜索（`ListColumn` 搜索） | Semantic parity |
| Tab / Shift+Tab | 焦点移动遵循 macOS 标准（`All controls` 可选） | macOS native |
| 方向键 | 列表选中项上下移动（等价 Web 列表卡片选择）+ 回车打开 | macOS native |
| Escape | 关闭弹层/菜单；退出搜索；AI 外推为通用取消 | macOS native |
| Space | 在可聚焦项上激活 | macOS native |
| Command+, | 打开设置（字号/主题偏好） | macOS native |

焦点策略：键盘焦点用原生 `FocusState`/`@FocusState`；列表 `List(selection:)` 用系统 selection；菜单用 `Menu`/`CommandMenu`/`.commands`。**不**用 Web 的 tab-index 顺序复刻，遵循 macOS 焦点习惯。

## 10. Loading、empty、error、offline、stale

- loading：列表用 `.redacted`；详情/编辑器用 skeleton placeholder（对应 `ListContentSkeleton`/`ReaderContentSkeleton` 语义）。
- empty：每页空态文案对齐 Web（notes「选择一条笔记/新建一条笔记」；clips「无剪藏」；feeds 按 `getFeedEmptyState`）。空态含一个主 action。
- error：loadError/`Could not load notes.` 等 → 空态面板 + 重试；不对旧内容误报。
- offline/stale：Web 用 `workspace-data-cache` 秒开回填旧数据【NoteEditorPage.tsx:120-157】；Mac v1 的数据层未落地（dev-apple：SwiftData/同步是计划中），因此 Mac 本规范**不**把「离线写入/同步状态」写成已实现能力。若先有本地缓存展示旧内容，必须明显标注 stale 且不得让用户误以为已保存（对应 dev-apple「计划中/未来实现」纪律）。
- 禁写未实现：任何 Web 有而 Mac 尚未落地（离线写入、AI、同步实况）都标注「未来工作/非现状」。

## 11. 可访问性与 motion

- 颜色对比：全部内容使用语义 token（§3），浅色纯黑白灰不变色；校验无暖色。危险色 `--coral`/danger 仅在对世界面。
- VoiceOver：三栏为可读的 `accessibilityElement(children: .contain)`；列表行聚合为单个可读元素（title + preview + time）；工具栏 actions 有 label；tab strip 暴露为标签组并朗读激活 tab。
- Motion：`@Environment(\.accessibilityReduceMotion)` reduce → 禁用 skeleton 扫光/过渡动画；对应 Web `prefers-reduced-motion: reduce` 全局 0.001ms 策略【globals.css:8310-8314】。
- Focus visibility：键盘 focus 用系统高亮 ring，不隐藏。
- 字号偏好：尊重「增加字号」辅助功能；阅读区默认 15.5pt。

## 12. 下游验收清单（ZOO-94/96/97 用）

**Shell / 窗口**
- 三栏默认宽对齐 §2.2；窗口最小尺寸满足 §2.2 W-4。
- 侧栏/列表折叠语义与 Web 一致；hover peek 为可选。
- 四种档位（compact/regular/wide）行为符合 §2.3。

**主题**
- 深色 token 全部映射 §3.1；浅色纯黑白灰 §3.2，视觉审查无暖黄/米色/奶油。
- 字体/圆角/缝隙/阴影对齐 §3.3-3.4。

**Tab strip（Apple enhancement）**
- [+] 新建、点击切换、x 关闭、active 高亮、溢出滚动、键盘（⌘T/⌘W/^⇥/⌘1-9）。
- 每 tab 独立页面状态；切换不覆盖其他 tab 上下文。
- 正常重启恢复 tabs + active id；退出登录/切账号清空；单 tab 解码失败可降级 unavailable 且可关闭，其余继续恢复。

**导航/状态**
- 每页 loading/empty/error/selected/stale 按 §6-8 矩阵。
- 删除当前项 → 下一条/空态；搜索在列表内。

**原生集成**
- 菜单（File/Navigate/View/Window/Tab）、焦点、键盘表 §9。
- VoiceOver、reduced motion、对比度 §11 通过。

**排除**
- 无 AI 行为进入 Mac v1 目标；无 SwiftUI/Web 产品代码改动；无 Web UI 重构。

## 13. 源码锚点与漂移核对

本规范对每个规则给文件名锚点（例如 `globals.css:661-667`、`NoteEditorPage.tsx:141-147`）。Web 源码会漂移，实施/验收前必须重新核对：

```bash
# 1. 确认基线
git fetch origin
git rev-parse origin/main                       # 应等于规范标注的基线 ede90619

# 2. 逐一验证引用路径与行号（替换为你要核实的文件）
grep -n "mewmo-shell {" apps/web/src/app/globals.css
grep -n "const \[selectedSlug" "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx"

# 3. 主题 token 是否出现暖色（浅色模式校验）
#    grep 认证页暖色不应成为 Mac 浅色基：
grep -n "#f3eee5\|#fffaf0\|#f4efe6\|#f3eee5" apps/web/src/app/globals.css

# 4. 组件/文件仍存在
test -f apps/web/src/components/shell/AppShell.tsx && echo ok
```

若引用路径、行号或组件名已变，更新本规范再提交——本文件是 Mac UI 单一真相源，必须以最新 `origin/main` 可验证。
