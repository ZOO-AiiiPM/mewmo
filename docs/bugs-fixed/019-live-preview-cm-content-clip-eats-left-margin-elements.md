# 019 · 编辑器左边缘裁剪线吃掉左外边距里的元素（表格行控制 + 任务勾选框）

**日期**：2026-06-22
**关联文件**：`app/src/index.css`、`app/src/lib/livePreview.ts`

## 症状

同一天出现两个看似无关的渲染 bug，其实是**同一个根因**：

1. **表格行控制按钮（↑↓+−）整排消失**。另一个 agent 给表格加横向滚动后，左侧那排行控制按钮全不见了（列控制 ←→+− 还在）。
2. **任务勾选框渲染成残缺的「⌐」**。`- [ ]` 未勾选项的方框只剩右半边一道弧，像个开口的「⌐」；勾选后变蓝底白勾反而正常。

## 根因（共用）

编辑器为了「正文自动换行、不出现横向滚动条」，在 `index.css` 给 `.live-md-editor` / `.cm-editor` / `.cm-scroller` / `.cm-content` 全部强制了 `overflow-x: hidden`。这道裁剪线正好落在**内容盒的左边缘**——任何被定位到内容左边缘**左侧**的元素，左边一条会被无声裁掉。

- **行控制**：横向滚动改造把按钮定位在首列左侧 `-28px`（负 left，在内容边缘左外侧）→ 被 `.cm-content` 裁光。列控制定位在 cell **上方**（负 top），而纵向 `overflow-y` 是 `auto` 没裁，所以列控制幸存——这个不对称正是「只有左侧消失」的线索。
- **勾选框**：列表 hanging-indent 用 `.cm-list-line .cm-task-checkbox { margin-left: -1.35em }`，比圆点的 `-1em` 多拉出 0.35em，戳到内容边缘左侧 ~5px，左边一条（含左圆角）被裁 → 残缺「⌐」。圆点用 `-1em`（正好贴边）所以没事。

**为什么一开始误判**：勾选框第一反应是「透明窗口里 macOS 原生 checkbox 渲染玄学」。实测 `getBoundingClientRect` 才发现框左缘 x=427、内容裁剪线 x=432，是**几何裁剪**不是原生渲染。教训：渲染异常先量坐标、和裁剪/溢出边界比对，别先归因到平台玄学。

## 修法

**表格行控制**（`livePreview.ts` + `index.css`）：把行控制从被裁的 `wrap`（在 `.cm-content` 内）改挂到编辑器外层 `.cursor-text` 容器——它在所有 `overflow:hidden` 之上、自身 `overflow:visible`、且有 `pl-10` 左留白槽，是 `.cm-content` 的祖先。绝对定位摆进左留白：横向锚 `wrap` 左缘（钉死左外边距、不随表格横滚跑）、纵向锚各行 cell 中心。表格本体不动 → 仍**居左**。加 `.cm-scroller` 滚动监听 + `ResizeObserver`（侧栏开合/窗口缩放跟手），`destroy()` 里移除留白区按钮防泄漏。因为按钮挂到了 `.live-md-editor` 之外，相关 CSS 选择器去掉 `.live-md-editor` 前缀（类名只在表格用，去前缀对列控制无副作用）。

**任务勾选框**（`index.css`）：
- 缩进 `-1.35em` → `-1em`，和圆点对齐、左缘正好贴内容边缘不越界 → 不再被裁（治本一处）。
- 顺手把勾选框从系统原生（`accent-color`）改成 CSS 自绘（`appearance:none` + 圆角边框 + 白勾 SVG），避免透明窗口里原生表单控件渲染不稳，未勾=浅灰圆角框、已勾=蓝底白勾，双模式一致可控。

## 踩坑记录

- **「左侧消失、上方还在」是裁剪不对称的强信号**：`overflow-x:hidden` + `overflow-y:auto` 时，左/右越界被裁、上/下越界不裁。看到「只有某一侧的装饰元素消失」先查那一侧的 overflow。
- **逃离祖先 `overflow:hidden` 裁剪的可靠手段**：`position:fixed` 会被带 `transform` 的祖先（如 framer-motion 的 `motion.div`，即使 identity matrix）困住、失效；把元素挂到**裁剪祖先之上、自身 overflow:visible 的定位祖先**再用 `position:absolute` 才稳。
- **改了挂载位置就要同步改 CSS 作用域**：元素从 `.live-md-editor` 内挪到外面，原来 `.live-md-editor X` 的样式会整体失效（位置/尺寸/flex 全丢，渲染成默认错乱），必须把选择器放宽。

## 后续优化（行控制可见性，2026-06-22）

行控制改到 gutter + JS 控制可见后，又暴露两个交互问题（列控制是纯 CSS hover 不受影响）：
- **编辑 cell 时仍弹按钮**：agent 原版 `focusin` 也触发显示，打字时左侧冒按钮干扰。去掉 focus 触发，并加「编辑态开关」——任意 cell 获焦 → 隐藏全部行控制且锁住 hover，焦点离开整张表才解锁。
- **连续跨行移动按钮堆叠**：行控制竖排比单行高，80ms hide 延迟下多行同时可见、糊在一起。改为 show 时先清掉其它行（同时只亮一行，根治堆叠）+ hide 延迟 80ms→40ms。

教训：把元素从「容器内 CSS :hover」迁到「容器外 JS 控制可见」后，原本 CSS 免费给的「同时只亮一个 / 即时消失 / 不被 focus 触发」都得在 JS 里重新实现，否则交互会退化。

## 后续优化②（往上离开表格跳错行，2026-06-23）

**症状**：光标在表格内往上移动到表头后，再按 ↑ **先跳到表格下方一行**，再按一次才到表格上方一行——多一个错误落点。增删过行的表格上更明显。

**根因**：表格是 block widget（`Decoration.replace({block:true})`，范围 `[range.from, widgetTo]`）。`syncToMarkdown('before')` 往上离开时把光标锚到 `range.from`（widget 的**起点偏移**）。但 CM6 对块级 widget 起点偏移的关联有歧义，会把它解析到 widget **之后**的位置 → 光标落到表格下方那行。

**修法**：锚点从 `range.from` 改成 `Math.max(0, range.from - 1)`——表格块起点的前一个偏移（= 上一行行尾），落在 widget 之外、无歧义在上方。一行改动。

**验证**：真机逐步按 ↑ 追踪——表头按 ↑ 直接落到表格上方空行（caretY 231 < 表顶 256），再按继续上移不重新进表。

**踩坑**：① 一开始纯靠读代码 trace，以为 `tableRangeToEnterFromCursor` 的边界 guard + `tableRangeBetween` 的严格比较已经挡住「离开又被吸回」——逻辑上确实挡住了，但**真正的错落不在那条路径**，而是 block widget 偏移关联本身把光标放到了下方。教训：光标/选区类 bug 必须真机复现看实际落点，纯静态 trace 会被「看似合理的 guard」误导。② block widget 的边界偏移（起点/终点）在 CM6 里都不可靠，往上锚到 `from-1`、往下锚到 `widgetTo` 之后并跳过 aux 空行——两端都得显式绕开 widget 边界，不能直接用 `range.from`/`range.to`。
