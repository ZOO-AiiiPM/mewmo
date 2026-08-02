# ZOO-124 Agent 通过 URL 添加剪藏与公开订阅

## Goal

用户在 Agent 对话中明确要求保存、收藏或剪藏 URL 时，直接创建自己的剪藏；明确要求订阅公开可添加来源 URL 时，发现并创建订阅。显式意图即是写入授权，不显示第二次确认。

## Requirements

- Agent 提供直接保存 URL 为剪藏的工具，复用当前用户剪藏创建的 URL 归一化、ownership、去重、抓取与持久化路径。
- Agent 提供直接订阅 URL 的工具，复用公开来源发现、创建、初始抓取、重复与失败回滚路径。
- 仅 URL、总结、阅读或搜索意图不触发写入；工具说明与系统提示必须明确此界限。
- 私有、需要认证、无效或未识别的来源失败时不写入，并给用户可操作的公开说明。
- 工具事件只暴露 URL 的安全摘要、动作和结果；不公开原始工具参数、网页内容、内部错误或敏感 URL 部分。
- 不修改 Workflow model 或 runtime 行为。

## Acceptance Criteria

- [ ] 明确保存 URL 的 Agent tool call 创建当前用户剪藏，无需 `AiAction` confirmation。
- [ ] 明确订阅公开来源 URL 的 Agent tool call 创建当前用户订阅并完成现有初始抓取流程。
- [ ] 剪藏与订阅均保留现有 URL 归一化、用户隔离和重复行为。
- [ ] 失败路径不留下 Clip、Feed 或 FeedEntry 写入，并返回能指导用户改用公开 URL 的安全结果。
- [ ] Agent 的 URL-only、摘要和阅读指引不调用写工具。
- [ ] focused tests 覆盖 ownership、重复、失败、意图、工具调用及事件脱敏。
- [ ] lint、TypeScript、theme 与 `git diff --check` 通过。

## Out of Scope

- Workflow model/runtime、Prisma schema、`packages/shared/src/types/` 变更。
- 私有源认证、第三方账号绑定、批量导入、额外确认 UI。
