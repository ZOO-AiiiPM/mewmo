# 批2 作战指令：Web 前端小修批（lead B）

工作目录（只能改这里）：`.worktrees/web-chat-small-fixes`，分支 `codex/web-chat-small-fixes`

## 任务清单

### B1. #2 输入法 composition 误发送
- 现象：拼音输入过程中按 Enter 直接发送了消息
- 修复：Composer 的 keydown 处理需判断 `event.nativeEvent.isComposing`（或 compositionstart/end 状态），composition 期间 Enter 不触发发送
- 位置：apps/web 的 agent Composer 组件（输入框 keydown 处理）
- 验收：单测或手动验证 composition 期间 Enter 不发送

### B2. #6 会话中展示笔记上下文芯片
- 需求：目前上下文芯片（「mewmo 笔记·使用最新草稿」）只在输入框里；发送后消息不显示。要在**对话流的用户消息**上渲染该芯片，表明该消息/会话建立在笔记上下文之上
- 实现：复用输入框芯片的视觉样式（小尺寸变体亦可）；数据上 context 已随消息传递，主要是 TranscriptList/消息气泡展示层补齐
- 验收：带上下文发送的消息在对话流里显示芯片；无上下文的消息不显示

### B3. #10-F 写操作成功后列表不刷新
- 现象：agent 执行「创建知识库」成功后，左侧知识库列表不自动刷新，需手动刷新页面
- 修复：action 执行成功事件 → invalidate 对应的数据缓存（React Query invalidateQueries 或项目现有的数据层刷新机制），覆盖知识库/笔记列表等受写操作影响的资源
- 排查方向：前端处理 action 执行结果的回调处；找项目现有 invalidate 模式复用
- 验收：创建/删除等写操作确认执行后列表自动更新

## 硬性约束
- 禁止 git commit/push（由主控完成）
- 只改 apps/web（及必要的共享包类型），不动 apps/agent
- 完成后跑：`NODE_OPTIONS="" pnpm lint && NODE_OPTIONS="" pnpm test:unit`（作用域可按 --filter web 收窄，但最终以全仓 lint 通过为准）
- 交付报告：改动文件清单、每个问题的根因、测试结果、遗留风险

## 参考
- 发现详情：.trellis/tasks/07-30-agent-eval-prompt-optimization/research/findings.md（#2/#6/#10-F）
- 先读 .trellis/spec/ 下 web 相关规范
