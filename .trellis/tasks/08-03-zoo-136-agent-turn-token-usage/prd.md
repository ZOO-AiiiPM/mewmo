# ZOO-136 Agent 每轮展示 Token 消耗

## Goal

每个 Agent Turn 终止后，在最终回复下方显示该 Turn 的 Token 总消耗，使用户无需打开可观测性工具即可了解资源使用。

## Requirements

- 总数聚合该 Turn 的全部 provider generation；每次调用按 `input + output + cacheRead + cacheWrite` 计算。
- reasoning 已包含在 output 中，不重复相加。
- completed、failed、stopped 在已有 usage 时显示；streaming 不显示未结算总数；缺失 usage 时不显示 `0 tokens`。
- 实时 terminal 与刷新或切换后的历史 session 显示相同数值。
- UI 只显示紧凑、低强调度的总数文本，例如 `12.8K tokens`。
- 不展示模型 ID、requested/response model、provider、cost、purpose、Harness/Tool budget 或 runtime metadata。
- 复用 `AiUsageEvent`、现有会话投影和共享 `AssistantRow`；不得建立第二套统计来源。
- 保留所有权校验，并为涉及的 API/repository 边界增加跨用户回归覆盖。

## Constraints

- 不修改 Prisma Schema、`packages/shared/src/types`、AI Workflows、模型配置或 provider adapter。
- 不新增依赖或额外详情 UI。

## Acceptance Criteria

- [ ] 单 generation Turn 的总数正确。
- [ ] 多 Tool、多 generation Turn 聚合所有 usage，包含 cache token 且不重复 reasoning。
- [ ] completed、failed、stopped 有 usage 时显示；streaming 与无 usage 时不显示。
- [ ] 实时 terminal 与历史 session 恢复一致。
- [ ] 页面只呈现总数，不泄露禁止的内部字段。
- [ ] 跨用户读取无法获得目标 Turn usage。
- [ ] 相关 Agent/Web/application/DB 测试、lint、TypeScript、theme、diff check、production build 和两主题浏览器验收通过。
