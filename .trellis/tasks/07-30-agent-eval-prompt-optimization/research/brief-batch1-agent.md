# 批1 作战指令：Agent 服务端修复（lead A）

工作目录（只能改这里）：`.worktrees/agent-loop-fixes`，分支 `codex/agent-loop-fixes`

## 任务清单（按优先级）

### A1. #7 会话锁 bug（最高优）
- 现象：assistant 回合已输出收尾文案后，用户点 proposal 确认按钮，服务端报「这个会话正在处理另一条消息，请稍后重试」
- 排查方向：apps/agent 的 turn/session 状态机——锁（busy 标记）释放时机是否晚于流结束事件；proposal 确认（apply action）请求与 turn 收尾的竞态
- 验收：turn 流结束后立即点确认不再报忙；补一条针对时序的单测

### A2. #10-T 工具执行后 loop 无后续
- 现象：proposal 确认执行成功后，对话没有新的 assistant 消息确认结果（「已建好知识库 XX」之类），loop 直接终止
- 排查方向：action 执行成功后是否应触发一次后续 generation（把执行结果回灌给模型让它收尾）；或至少由服务端注入一条系统确认消息
- 设计约束：优先「执行结果回灌模型生成收尾」方案，保持对话自然；注意别和 A1 的锁修复打架
- 验收：确认执行后对话中出现结果确认消息

### A3. #1 时间注入
- system prompt 组装时动态注入当前日期时间（Asia/Shanghai），让模型能处理「今天」「最近一周」
- 位置参考：apps/agent 组装 system prompt 处（prompt-loader / 拼装链路）
- 注意：项目有「Prompt 手动 version + 自动 revision 双版本机制」，改动 prompts/*.md 时检查 langfuse-manifest.json 是否需 bump version；纯代码注入（运行时拼接）不动 md 文件则无需 bump
- 验收：单测断言 system prompt 含当前日期

### A4. #5-P 确认执行后复述变更
- 提示词引导：写操作执行完成后，assistant 收尾文案必须复述本次变更要点（做了什么、对象、去向）
- 若 A2 实现了结果回灌，此项在回灌 prompt 里要求复述即可，二者合并实现
- 改 prompts/system.zh.md 时 bump manifest version

## 硬性约束
- 禁止 git commit/push（由主控完成）
- 完成后跑：`NODE_OPTIONS="" pnpm --filter agent lint && NODE_OPTIONS="" pnpm --filter agent test`（若有独立测试脚本以 package.json 为准）
- 交付报告：改了哪些文件、每个问题的根因、方案取舍、测试结果、遗留风险

## 参考
- 发现详情：.trellis/tasks/07-30-agent-eval-prompt-optimization/research/findings.md（#1/#5/#7/#10）
- 先读 .trellis/spec/ 下 agent 相关规范
