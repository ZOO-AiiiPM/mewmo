# Implement: Mew 对话页 Codex 风格 UI 重构

工作区：`.worktrees/mew-chat-codex-ui`（分支 `codex/mew-chat-codex-ui`，基于 origin/main）

## 执行清单（按序）

### Step 1 前置确认
- [ ] 读 `apps/web/src/lib/shared-note-markdown.ts` 确认 heading block 是否携带 level 字段
- [ ] 读 `globals.css` 中 `mewmo-agent-home`、`mewmo-chat-switcher`、`mewmo-chat-input` 现有段落，确定改动锚点

### Step 2 Markdown 渲染（R5，独立性最强，先做）
- [ ] `shared-note-markdown.ts` 解析器补缺：水平线/嵌套列表/删除线/任务列表（含分享页渲染端同步）
- [ ] 解析器新增能力补单测
- [ ] `StreamingMarkdown.tsx`：heading 渲染真实 h3/h4/h5 层级，新 block/inline 类型接入
- [ ] `globals.css` 重做 `.mewmo-md` 段：正文色 `var(--ink)`、字号、行高、标题层级、代码块、表格、引用、divider
- 验证：本地跑 dev，发一条含标题/列表/代码块/表格的消息目测

### Step 3 消息区布局 + 边缘渐隐（R1）
- [ ] `TranscriptList.tsx` 加 shell wrapper + mask 渐隐
- [ ] 用户气泡右对齐、助手消息去卡片化、行距调整（globals.css）
- 验证：滚动时上下渐隐可见；明暗主题检查

### Step 4 工具调用 UI（R2 + R3）
- [ ] 重写 `ToolBlock.tsx`：行内状态行 + shimmer + 3s 后计时
- [ ] 新增 `ToolGroup.tsx` 与 `groupBlocks()` 纯函数；`AssistantRow.tsx` 接入分组渲染
- [ ] streaming 且末块非 text 时显示"正在工作…"状态行
- [ ] `groupBlocks` 补单测（连续段分组/running 展开/单个不折叠）
- 验证：发一条会触发多工具调用的消息，观察运行中 shimmer/计时与完成后聚合

### Step 5 历史会话面板（R4）
- [ ] `ChatSwitcher.tsx` 视觉重做 + 相对时间 + 过滤空会话
- [ ] `use-agent-chats.ts` 首轮完成自动命名（仅标题=="新会话" 时）
- [ ] 自动命名逻辑补单测（可测的纯函数部分：标题截断）
- 验证：新会话发消息后标题自动变化；历史面板无空"新会话"堆积

### Step 6 /mew 首页、侧边栏容器与输入框微调（R1/R6/D5）
- [ ] hero、chips、输入框样式打磨
- [ ] 侧边栏 `mewmo-ai-rail` 头部/tab/内边距同步打磨
- 验证：/mew 空态与对话态、侧边栏展开态截图对比

### Step 7 质量门禁
- [ ] `pnpm lint`
- [ ] `pnpm test:unit`
- [ ] `pnpm build`
- [ ] Playwright/浏览器截图：/mew 明暗主题、侧边栏 agent tab、工具调用运行态、历史面板

## 回滚点

每个 Step 独立 commit；任一步出问题可单独 revert。

## 验证命令

```bash
cd .worktrees/mew-chat-codex-ui
pnpm lint && pnpm test:unit && pnpm build
```
