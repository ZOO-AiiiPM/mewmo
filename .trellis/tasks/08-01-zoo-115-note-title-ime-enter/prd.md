# ZOO-115 笔记标题 IME Enter 修复

## Goal

修复笔记标题在拼音等 IME 组合输入期间按 Enter 确认候选时误提交标题并跳入正文的问题，同时保留非组合态 Enter 的现有快捷行为。Linear ZOO-115 是需求与验收真源。

## Background

- 标题是 `NoteEditor` 内的单行 `contentEditable` h1；`handleTitleKeyDown` 当前把所有 Enter 都解释为“提交并聚焦正文” [`apps/web/src/components/editor/NoteEditor.tsx:322`]。
- 键盘决策函数当前只接收 `key`，无法识别 `nativeEvent.isComposing` 或 composition 边界的 `keyCode === 229` [`apps/web/src/components/editor/title-ui.ts:13`]。
- 现有单元测试只覆盖普通 Enter，尚未锁定 IME 行为 [`tests/unit/editor-title-ui.test.ts:20`]。
- 本问题只在客户端交互层，不需要修改保存 API、数据库、slug 或同步协议。

## Requirements

1. 标题键盘决策必须同时考虑 `key`、`isComposing` 与兼容性 `keyCode`。
2. `key === "Enter"` 且 `isComposing === true` 时必须允许浏览器/输入法完成候选确认，不调用 `preventDefault`、不提交标题、不聚焦正文。
3. `key === "Enter"` 且 `keyCode === 229` 时按组合输入处理，覆盖 Safari 与部分 IME 的 composition 结束边界。
4. 非组合态普通 Enter 继续规范化标题、进入现有草稿同步链路并聚焦正文。
5. 其他按键行为保持不变。
6. 事件判断保持为独立纯函数并由行为单测覆盖，组件只负责把 React 事件字段传入决策函数。

## Out Of Scope

- 修改标题的单行规范化、`Untitled` fallback、slug 或自动保存策略。
- 修改正文编辑器、聊天输入框或其他表单的 Enter 行为。
- 增加新的快捷键或输入法 UI。

## Acceptance Criteria

- [ ] 拼音候选未上屏时按 Enter，候选文本正常进入标题，标题仍持有焦点。
- [ ] 组合态 Enter 不调用标题提交逻辑，也不把焦点移动到正文。
- [ ] `keyCode === 229` 的 Enter 不误提交。
- [ ] composition 结束后再次按普通 Enter，标题正常提交并聚焦正文。
- [ ] 不使用输入法时，普通 Enter 与其他按键的行为没有回归。
- [ ] `tests/unit/editor-title-ui.test.ts` 覆盖以上决策分支并通过。
- [ ] 相关 Web lint/build 通过；Chromium 中完成一次真实拼音输入浏览器验收。

