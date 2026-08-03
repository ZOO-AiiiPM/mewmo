# ZOO-132 笔记标题末尾空格修复

## Goal

标题编辑态原样保留末尾及连续空格，继续输入字符时不得吞掉空格；失焦或切换笔记时仍按既有规则规范化标题。

## Root Cause

`NoteEditor` 的 `onInput` 使用 `/\s+/g` 规范化每次输入。`contentEditable` 用不换行空格表达行尾空格时，这段逻辑会重写整个 `textContent`，破坏浏览器维护的空格和光标状态。

## Acceptance Criteria

- [ ] 标题末尾输入一个或多个空格后继续输入，空格全部保留。
- [ ] 普通键盘与中文拼音组合输入行为一致。
- [ ] 换行仍被规范化，标题保持单行。
- [ ] 失焦或切换笔记后继续使用现有标题规范化规则。
- [ ] 普通 Enter 与 IME Enter 行为不回归。

## Out Of Scope

- 修改标题持久化、草稿同步、slug 或 Untitled fallback。
- 修改正文编辑器和其他输入框。
