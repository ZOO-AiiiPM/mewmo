# 标题井号显隐反复错误

- **症状**：标题行的 `# ` 有时在没点击该标题行时仍然出现，或曾经反向表现为正在编辑标题时 `# ` 被隐藏。用户体感是标题源码标记显隐不稳定。
- **根因**：`livePreview` 用 CodeMirror selection 所在行判断哪一行是 active heading。selection 是持久状态，不等于“用户此刻点击的位置”。当正文失焦、标题输入框聚焦、或点击正文 wrapper 空白区只调用 `view.focus()` 时，旧 selection 可能仍停在上一次点过的标题行，live preview 就会误判那条 heading 仍在编辑中。
- **修法**：保留“只有当前正文编辑行显示 `# `”的产品规则，但所有非正文焦点必须显式让 live preview 退出 active body 状态；点击正文空白区不能只 `focus()`，要把 selection 明确放到正文末尾。这样 heading marker 不再依赖 stale selection。
- **关联文件**：`app/src/components/NoteEditor.tsx` · `app/src/lib/livePreview.ts`

## 踩坑记录

不要用“井号永远显示”绕过焦点同步问题；那会和 live preview 的 Obsidian 式体验冲突。真正的边界是：正文编辑器有真实焦点且 selection 在某一行时，那一行显示源码标记；离开正文或从外层空白进入正文时，必须显式更新焦点/selection 状态，不能继承旧 selection。
