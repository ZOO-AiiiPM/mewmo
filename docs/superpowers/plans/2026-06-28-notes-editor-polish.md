# Plan: Notes 编辑器优化（Crepe 打磨第一批）

**Spec:** `docs/superpowers/specs/2026-06-28-notes-editor-polish.md`
**Goal:** Heading 黑体 + hover 柄可靠 + 底部胶囊工具栏 + 快捷键，复用 Crepe 原生命令。

---

## 依赖

- 新增直接依赖 `@milkdown/kit@7.21.2`（已作为 crepe 的传递依赖存在，提为直接依赖以稳定 import 命令/schema）。
  - 用到：`@milkdown/kit/core`（`commandsCtx`、`editorViewCtx`）、`@milkdown/kit/preset/commonmark`（`blockquoteSchema`、`listItemSchema`、`codeBlockSchema`、`wrapInBlockTypeCommand`、`addBlockTypeCommand`、`setBlockTypeCommand`、`clearTextInCurrentBlockCommand`）、`@milkdown/kit/preset/gfm`（`createTable`）。
- `@milkdown/react` 的 `useInstance()` 在 React 侧拿 editor 调命令。

---

## Task 1: Heading 字体（CSS）

**File:** `apps/web/src/components/editor/editor-theme.css`

- [x] 在 `.crepe-editor-wrapper .milkdown` 作用域覆盖 `--crepe-font-title: var(--font-sans)`，标题回落到项目黑体。
- 验证：标题视觉变黑体，正文 `--crepe-font-default` 不动。

## Task 2: hover 柄可靠（CSS）

**File:** `apps/web/src/components/editor/editor-theme.css` + `NoteEditor.tsx`(wrapper class)

- [x] ProseMirror 左 padding 从 24px 提到约 56–64px，给柄留 gutter。
- [x] 确保柄不被裁切：外层滚动容器改为只纵向滚动（`overflow-y:auto; overflow-x:visible` 不可行时，改为给 `.milkdown` 留左内距并让柄落在可视区内），即柄的 left 落在 padding gutter 内而非容器外。
- 验证：hover 标题/正文/列表/引用各类块，左侧均稳定出现 `+`/`⠿`。

## Task 3: 插入命令封装（共享逻辑）

**File（新建）:** `apps/web/src/components/editor/insert-commands.ts`

- [x] 导出纯函数 `insertBlock(editor, kind)`，`kind ∈ {task, quote, table, code}`，内部 `editor.action((ctx) => …)` 复刻 Crepe 斜杠菜单 onRun：
  - quote：`wrapInBlockTypeCommand(blockquoteSchema)`
  - task：`wrapInBlockTypeCommand(listItemSchema, {checked:false})`
  - code：`setBlockTypeCommand(codeBlockSchema)`
  - table：`addBlockTypeCommand(createTable(ctx,3,3))`
  - 与 Crepe 斜杠菜单不同：**不调** `clearTextInCurrentBlockCommand`——那是用来清掉 `/quote` 触发词的，工具栏按钮作用在用户真实内容上，清空会误删本行文字。改为「就地转换、保留文本」语义（实测引用/代码/表格均文字保留）。
- 复用性：底部工具栏按钮与快捷键都调它，单一真相源。

## Task 4: 底部胶囊工具栏（React 组件）

**File（新建）:** `apps/web/src/components/editor/InsertToolbar.tsx`
**File（改）:** `NoteEditor.tsx`（在 `<MilkdownProvider>` 内渲染，紧邻 `<Milkdown/>`）

- [x] `useInstance()` 拿 editor；按钮 onClick → `insertBlock(editor, kind)`。
- [x] 样式：`position:absolute; bottom; left:50%; translateX(-50%)`；胶囊 `rounded-full`；半透明 `bg-paper/80 backdrop-blur border-line`；图标按钮（待办/引用/表格/代码）。
- [x] 点击后回焦编辑器（避免 selection 丢失导致命令 no-op）。
- 注意：必须在 Provider 内，否则 `useInstance` 拿不到实例。

## Task 5: 键盘快捷键 —— 本批推迟（用户指示）

不做。插入逻辑仍抽成 `insertBlock`，后续要加快捷键时直接复用。

---

## Risks

1. **工具栏点击丢 selection**：ProseMirror 失焦后 selection 仍在，命令多数可用；保险起见点击后 `view.focus()`。
2. **@milkdown/kit import 路径**：以 crepe 源码 import 路径为准（`@milkdown/kit/preset/commonmark` 等），已从源码证实。
3. **柄裁切**：若调 padding 仍被某祖先裁，回退方案是把柄 provider 的容器 z-index/overflow 单独放开。

---

## DoD
见 spec 验收标准 1、2、3、5（第 4 项快捷键推迟）；逐项浏览器验证 + 无 console 报错。
