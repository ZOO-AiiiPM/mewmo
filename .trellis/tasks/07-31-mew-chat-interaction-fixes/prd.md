# ZOO-84 Mew 对话交互修复与验收

## Goal

接管暂停的 Qoder 会话，在不触碰 dirty `main` 的前提下，把 Mew 对话页批 A 的交互修复做成可复现、可刷新、不会污染模型上下文的完整行为，并由独立验收确认。

## Confirmed facts

- Linear 顶层 Issue 是 `ZOO-84`，对应本 Trellis task、一个 AO session、一个 AO worktree、一个带 Issue ID 的 branch 和一个 PR。
- 业务代码基线是 clean 分支 `codex/mew-chat-interaction-fixes` 的 `ad543ecf`；它已包含 A1、A2、深度洞察和 hero 动画的候选实现，但尚未完成充分测试与独立验收。
- Qoder 最后反馈的“深度思考”是独立 turn option，不是 `deep-insight` Skill 的别名。接管基线缺少该控件和协议接线。
- 根目录 `main` 有大量其他会话的未提交改动，只能作为只读证据，不得修改、stash、reset、清理或混入本任务。

## Requirements

### A1 Stop must not submit the draft

生成中点击停止只终止当前流，草稿保留且同一次 pointer/click 序列不能落到重新出现的发送按钮。随后用户主动发送必须正常工作。

### A2 Edit and regenerate replace the original turn

编辑早期用户消息后发送，或对某轮回答重新生成时，从目标 turn 起截断展示和持久化历史，再在原位置生成新轮次。刷新后 transcript 保持截断结果，后续模型上下文不得包含旧 suffix。截断失败必须 fail closed，禁止静默退化为 append。

### A3 Restore the separate Deep Thinking toggle

共享输入框显示独立“深度思考”开关。开启后仅本次发送携带 `thinking: true`，从 Web contract、API 到 Agent runtime 完整透传；发送后复位。它不能激活或替代 `deep-insight` Skill。

### A4 Deep Insight works from Mew home

`/mew` 和侧边栏继续显示“深度洞察”。首页无页面上下文时也可激活，预填面向工作区最近内容的提示词并携带 `deep-insight` Skill；有上下文的侧边栏行为不得回归。

### A5 New-chat hero transition

新会话 hero 使用淡入和轻微上移动画，无加载态闪烁；`prefers-reduced-motion` 下禁用动画。

## Acceptance criteria

- A1-A5 在现有测试层允许处有聚焦自动化覆盖，worker 报告精确命令和结果。
- A2 的 API ownership、目标 turn 不存在、事务截断、active leaf 回退和失败路径被验证；刷新和下一次模型上下文行为一致。
- A3 的 UI 状态、request contract、route 透传及 runtime thinking level 均被验证，且与 A4 可独立组合。
- 相关 package 的 type-check、lint、unit/integration tests 通过；无法自动化的 UI 行为有明确人工复现步骤。
- Codex 主控独立执行 `trellis-check`；发现问题只建 Linear sub-issue 并继续复用同一执行 tuple。
- Worker 创建标题含 `issue-ZOO-84` 的 PR，保持未合并状态等待用户授权。

## Out of scope

- 文件上传真功能（批 B）。
- Skill 栏整体重设计。
- 合并 PR #57-#61 或清理其他 worktree/branch。
- 自动 merge、部署和 Production 发布。

## Blocking questions

无。用户已批准按上述工作流启动真实接管实验。
