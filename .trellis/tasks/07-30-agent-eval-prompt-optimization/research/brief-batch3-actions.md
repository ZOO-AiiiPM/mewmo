# 批3 作战指令：消息操作条 + 过渡动画（lead C）

工作目录（只能改这里）：`.worktrees/web-message-actions`，分支 `codex/web-message-actions`

## 任务清单

### C1. #3+#9 消息操作能力（对标主流 AI 对话产品）
- **复制**：assistant 消息 hover 出操作条，含复制按钮（复制纯文本）
- **重试**：最后一条 assistant 消息可重试（重新生成）。注意：TranscriptList 已有 onRetry 链路但仅失败时露出，排查后端 retry 端点能否复用于「对成功消息重新生成」；若后端不支持，只对失败/最后一条做重试并在报告中说明
- **编辑重发**：用户消息 hover 出编辑按钮 → 内容回填输入框（或就地编辑）→ 重新发送。最小可用：回填 Composer 即可，不要求截断历史
- **暂停生成**：流式输出期间显示停止按钮，点击中断当前 turn。排查前端 stream abort 机制（AbortController / 现有取消端点）；若服务端无取消端点，做前端断流 + 报告说明服务端缺口
- 操作条视觉：hover 显现、图标按钮、与现有 mewmo-transcript 样式体系一致（复用 PrototypeIcon）

### C2. #4 加载过渡动画
- 现象：打开 agent 面板/会话加载过程无过渡，生硬
- 修复：加载态骨架屏或淡入过渡；assistant 回复等待时的 thinking 指示（若已有则优化其出现时机）
- 保持轻量：CSS transition/animation 优先，不引新依赖

## 硬性约束
- 禁止 git commit/push（由主控完成）
- 只改 apps/web，不动 apps/agent（若发现必须动服务端才能实现的项，标记「服务端缺口」写进报告，不要自己改）
- 完成后跑：`NODE_OPTIONS="" pnpm lint && NODE_OPTIONS="" pnpm test:unit`
- 交付报告：功能矩阵（每个操作做到什么程度）、改动文件、服务端缺口清单、测试结果

## 参考
- 发现详情：.trellis/tasks/07-30-agent-eval-prompt-optimization/research/findings.md（#3/#4/#9）
- 先读 .trellis/spec/ 下 web 相关规范
- 现有组件：apps/web/src/components/agent/（TranscriptList、Composer 等）
