# Design: Mew 对话页 Codex 风格 UI 重构

## 总体思路

改动集中在 `apps/web`，两个入口（`/mew` 页与 AISidebar agent tab）共用组件，只改共享层。不动流式协议、API、数据模型。样式全部在 `globals.css` 的 `mewmo-*` 体系内演进，不引入 Tailwind prose 或第三方 markdown 库。

## 模块设计

### D1 消息区布局与边缘渐隐

文件：`components/agent/TranscriptList.tsx`、`AssistantRow.tsx`、`globals.css`

- `.mewmo-transcript` 外包一层 `.mewmo-transcript-shell`（新增 wrapper），在 shell 上应用：
  ```css
  mask-image: linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%);
  ```
  （含 `-webkit-mask-image` 前缀。mask 放 wrapper 上避免影响滚动条交互——实测若滚动条被 mask 裁切可接受，Codex 亦如此。）
- 用户消息 `.mewmo-ai-message--user`：`align-self: flex-end; max-width: 78%; background: var(--hover); border-radius: 14px; padding: 8px 12px;`
- 助手消息：去边框去底色，`max-width: 100%`，行距放松（`line-height: 1.7`）；**正文色改 `var(--ink)`（`.mewmo-md` 现为 `--ink-soft`）**，工具行/次要信息保持灰阶
- 行间距：turn 之间 `gap: 28px`（现 14px），turn 内块间 `gap: 10px`

### D2 工具调用 UI（ToolBlock 重做 + 聚合）

文件：`components/agent/ToolBlock.tsx`（重写）、新增 `components/agent/ToolGroup.tsx`、`AssistantRow.tsx`（分组逻辑）、`globals.css`

- **单个工具行**（ToolBlock）：去卡片化，渲染为一行 `icon + label + (耗时)`：
  - running：spinner 图标 + label 加 shimmer 动画（CSS `background-clip: text` 扫光）；组件内 `useEffect` 每秒 tick，`startedAt`（组件挂载时间）超 3s 后追加 `· Ns`
  - done：低饱和勾图标 + 灰字
  - error：红色叉 + 错误文案
- **聚合**（ToolGroup）：`AssistantRow` 渲染前把 `assistant` blocks 里**连续的 tool block 段**折成一组：
  - 组内有 running：组保持展开态，逐行显示
  - 组内全部终态且 ≥2 个：折叠为一行摘要"已完成 N 步操作 ▸"，点击展开逐行明细
  - 单个终态 tool：直接显示单行，不加折叠壳
  - 分组是纯渲染层函数 `groupBlocks(blocks)`，不改 `AssistantBlock` 数据结构
- **底部工作状态行**：`AssistantRow` 在 `isStreaming` 且最后一个 block 非 text 时，于 blocks 之后渲染 `正在工作…` shimmer 行（替代现在仅空内容时的三点动画；三点动画保留用于完全无内容阶段）

### D3 Markdown 渲染增强

文件：`components/agent/StreamingMarkdown.tsx`、`lib/shared-note-markdown.ts`、`globals.css`

- **解析器补缺**（已确认源码缺口，均为增量扩展，分享页同步受益）：
  - 水平线：新增 block 类型 `divider`，匹配 `/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/`（需在列表/表格判定之前）
  - 嵌套列表：`list` 的 items 携带 `depth`（按缩进 2 空格/级），渲染为嵌套 ul/ol
  - 删除线：新增 inline token `strikethrough`（`~~x~~`）→ `<del>`
  - 任务列表：列表项识别 `[ ]`/`[x]` 前缀 → 只读 checkbox
  - 类型变更为新增可选字段/新 union 成员，分享页 `SharedNoteMarkdown` 渲染端同步处理新类型（缺省降级为段落不破坏）
- `renderBlock` 的 heading 分支改为真实标签：level 1→`h3`、2→`h4`、≥3→`h5`（class 保留 `mewmo-md__heading mewmo-md__heading--{n}`），解析器已输出 level 字段，直接透传
- CSS 重做 `.mewmo-md`：正文色 `var(--ink)`、13.5px / line-height 1.7；h 层级 15.5/14.5/13.5px 加重字重；代码块 12px、内边距 12px、带背景与圆角；表格 12.5px、隔行底色；引用左边线加浅底；divider 为浅色 hr
- `pre-wrap` 保留在段落上（流式期间换行稳定）

### D4 历史会话面板

文件：`components/agent/ChatSwitcher.tsx`、`lib/agent/use-agent-chats.ts`、`globals.css`

- **视觉**：drawer 行高收窄（36px），标题单行省略 + 右侧相对时间（`updatedAt` → "刚刚 / N 分钟前 / N 小时前 / M-D"，新增小工具函数 `relativeTime`），hover 显示 more 按钮，活跃项左侧 accent 条
- **隐藏空会话**：ChatSwitcher 列表过滤 `messageCount === 0 && id !== activeChatId` 的项
- **自动命名**：`use-agent-chats.ts` 中，监听 `store.stableRows` 首次从 0 → >0 的变化：若当前 chat 标题为"新会话"，取 `stableRows[0].userContent` 截断 24 字符调用 `renameChat`（静默失败不打扰用户）。放在 hook 内保证两个入口都生效。

### D5 /mew 首页、侧边栏容器与输入框微调

文件：`app/(app)/mew/page.tsx`、`components/shell/AISidebar.tsx`、`components/agent/ChatInput.tsx`、`globals.css`

- hero 标题/副文案字号层级微调，chips 改为 Codex 式浅描边胶囊
- 输入框：圆角加大（14px）、聚焦描边过渡、发送按钮激活态更明显；placeholder 色降一档
- 侧边栏容器 `mewmo-ai-rail`：头部行高/间距、tab 激活态、面板内边距与新消息区风格统一（仅容器样式，不改结构与交互）

## 数据流与兼容性

- `AssistantBlock` 类型不变；tool block 计时为组件本地状态（挂载即开始），持久化转录回放时 status 已是终态，不会出现计时
- `tool.completed` 失败判定仍沿用 label 后缀"失败"的现有约定
- 自动命名只走已有 `PATCH /api/agent/chats/:id`，无新端点
- 深浅主题：所有新样式用现有 CSS 变量（`--ink/--ink-soft/--ink-faint/--line/--hover/--s1/--s3`），不写死颜色

## 风险与回滚

- mask 渐隐在 Safari 需 `-webkit-mask-image`；若 mask 与 `overflow-y: auto` 组合出现滚动条被裁，退化方案：改用上下两个绝对定位渐变遮罩层（`pointer-events: none`）
- 自动命名与用户手动重命名竞争：仅当标题仍为"新会话"时触发，手动改过即跳过
- 全部为前端改动，回滚 = revert 单分支
