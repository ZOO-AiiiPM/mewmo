# ZOO-74 Frontend Conversation、Transcript 与多会话体验

## Goal

把 Agent Sidebar 从“历史消息、乐观消息和 SSE 状态混在一个数组”的原型，收口为可恢复的多会话对话体验。用户在纯文本、Tool、确认、失败、重试、刷新和切换场景中都应看到稳定的一次 Turn，而不是 Pi entry、JSON、空 assistant bubble 或串到其他会话的事件。

## Background

- Linear `ZOO-74` 是父 Issue `ZOO-63` 的 Frontend 工作包，父附件《Agent Conversation Runtime 与前端体验重构 Spec》已批准实现。
- 当前工作区已有尚未验收的 ZOO-74 草稿：`apps/web/src/lib/agent/`、`apps/web/src/components/agent/`、Chat API 和 Sidebar 接线。它们是接手基线，不是已完成证据。
- 当前 Agent 服务仍只发送 legacy SSE：`start`、`text_delta`、`thinking_delta`、`tool_start`、`tool_end`、`compaction`、`end` 和最终 `result/error`；服务端尚未提供父 Spec 定义的 `chatId/turnId/seq` 稳定事件或断线补发接口（`apps/agent/src/ports.ts:144`、`apps/agent/src/server.ts:54`）。
- Web 仓库已有 Vitest 依赖和测试范式，但 `apps/web/package.json` 的包级 `test` 当前为空操作；新增 Agent conversation 文件尚无测试。
- `pnpm --filter @mewmo/web lint` 在接手基线上通过。

## Requirements

1. 持久化 transcript 与 active Turn live state 必须分离。发送时产生一个乐观 user/assistant row，完成后以权威结果按 Turn 身份替换，不能盲目追加出重复行。
2. 同一 Turn 内的 assistant tool call、tool result、thinking/search 和最终文本聚合在一个 assistant row 内。UI 只显示产品化 block，不显示原始工具名、参数、结果、Pi entry、provider metadata 或内部错误栈。
3. 前端必须同时兼容当前 legacy SSE 与父 Spec 的稳定 ConversationEvent DTO。稳定事件按 `(turnId, seq)` 去重，拒绝错误 chatId、错误 turnId、重复、回退或迟到事件；terminal event 必须真正完成或失败当前 Turn。
4. 断线补发只在后端提供 `seq` 重放契约后启用。当前实现要保留最后确认 seq 和恢复接口边界，但不得伪造后端保证；ZOO-70 未提供时将该项记录为跨 Issue 依赖。
5. 失败必须保留用户输入、原上下文和 skill，原位显示可重试错误；重试生成新的 execution attempt/clientRequestId，同时移除或替换旧失败行，不能丢失发送时 context，也不能重复确认写操作。
6. 用户可以新建、切换、重命名、清空和删除 Chat。所有操作成功后，当前 transcript、活动会话和会话列表必须立即一致；失败不能静默伪装成功。
7. 笔记、剪藏和订阅 context 只在发送时绑定，切换页面 context 不得隐式创建、切换、合并或删除 Chat。
8. 持久化消息必须按真实 Turn 关系投影。若当前 API 没有 `turnId`，兼容配对只能作为 legacy fallback；稳定 DTO 到位后优先使用 `turnId`，不以相邻数组位置冒充长期契约。
9. Markdown 流式与完成态视觉连续，代码块、列表、链接和长文本不撑破 Sidebar；交互在桌面/窄屏、深色/浅色主题中可用且无重叠。
10. Chat API 的重命名、清空和删除必须验证登录与 ownership。数据层操作不得越权修改其他用户会话。
11. 为 event adapter、transcript reconciliation、Tool display、失败重试和 Chat 操作补自动测试；静态检查、相关测试、构建和浏览器验收结果必须记录真实输出。

## Acceptance Criteria

- 纯文本、Tool、确认、失败和重试五类 Turn 均表现为一个稳定 user/assistant row，最终文本不为空且无重复。
- 重复、乱序、错误 chatId/turnId 和切换 Chat 后迟到的稳定事件不会污染当前 transcript。
- legacy SSE 在当前后端上仍可发送、流式显示、完成和失败；稳定 ConversationEvent fixture 可完成、失败并按 seq 去重。
- 重试保留原输入、context 与 skill，使用新的 clientRequestId；旧失败状态被替换而不是累积。
- 新建、切换、重命名、清空和删除后，列表、活动 Chat 与 transcript 同步；API 失败向用户显示可恢复状态。
- 切换笔记/剪藏/订阅 context 不改变 active chatId，下一次发送使用新的显式 context。
- UI 不显示 Pi entry、Tool JSON、provider 字段或内部错误栈。
- 相关 Vitest、Web lint、Web build 和浏览器桌面/窄屏双主题验收通过；任何因 ZOO-70 未交付而无法验证的 seq 补发项被明确标为依赖，不描述为已完成。

## Out Of Scope

- 不修改 `apps/agent`、`packages/ai` 或 Application Runtime 来实现 ZOO-70 的服务端协议。
- 不开发或部署 Automation，不接入 Langfuse，不执行 Production 发布。
- 不直接读取或渲染原始 Pi Session entries。
- 不重新设计整个 Mewmo Sidebar、全局导航或非 Agent 页面。
- 不改 Prisma schema；若服务端 DTO 需要 schema 变化，由对应所有者另行处理。

## Key Decisions

- 继承并审计现有未提交 ZOO-74 草稿，保留符合父 Spec 的部分；没有测试和验收的代码不按完成处理。
- 以父 Spec 的 Mewmo DTO 为目标契约，同时保留 legacy adapter 直到 ZOO-70 接入，避免前后端并行期间阻塞基础 UI 验证。
- 不手写完整 Markdown 解析器作为长期方案；优先复用仓库已有且安全的 Markdown 渲染链路，只有流式兼容层保留在 Agent 模块。
- 本任务只提交明确属于 ZOO-74 的文件。当前工作区的部署交接文件、协作层和其他任务改动不得混入提交。

## Risks And Dependencies

- ZOO-70 未提供稳定 event/replay API 前，网络中断后的 `seq` 补发无法端到端验收；前端只能验证去重、隔离和重新加载 persisted transcript 的降级路径。
- 当前 `main` 工作区含多个任务的未提交文件。开工时需在不丢失现有改动的前提下建立 `codex/zoo-74-*` 分支，并用精确暂存隔离提交。
- 当前 persisted message DTO 没有明确 `turnId` 字段，legacy 相邻配对可能在异常历史下产生孤儿行；需要对稳定 DTO 做兼容预留并覆盖异常 fixture。

