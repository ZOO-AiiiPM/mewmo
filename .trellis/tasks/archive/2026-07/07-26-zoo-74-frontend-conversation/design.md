# Technical Design

## Boundaries

ZOO-74 的实现边界保持在 Web：Agent Sidebar 负责 Chat lifecycle，conversation store 负责当前 Chat 的持久化/临时状态，transcript adapter 负责 DTO 到 row model 的纯转换，stream client 只负责 SSE 解析、验证与恢复信号。Web API 负责登录、ownership 与 Chat 命令。任何 Pi 类型和 Runtime entry 都不得越过该边界。

## State Model

每个 active Chat 有三层状态：

1. `stableRows` 来自 `GET /api/agent/chats/:id`，是刷新后的权威 transcript。
2. `activeTurn` 保存发送时快照：chatId、clientRequestId、临时/服务端 turnId、input、context、skill、lastSeq、blocks 与 attempt 状态。
3. `liveRow` 由 activeTurn 派生，只用于当前流式显示；terminal event 或 legacy result 到达后按 Turn 身份 upsert 到 stableRows 并清空 live state。

Chat 切换会 abort 旧请求并提升 generation/token。所有异步 load、stream callback 和命令完成回调在写状态前同时校验 target chatId 与 generation，因此迟到事件不能写入新 Chat。

## Event Flow

legacy 路径保持当前兼容性：Web BFF 代理 Agent 的 legacy SSE，adapter 聚合 delta/tool event，最终 `result/error` 形成权威 completed/failed row。

稳定路径严格消费父 Spec DTO：

- 首个 `turn.started` 把 optimistic id 映射到服务端 turnId。
- 后续事件同时校验 chatId、turnId 和 `seq > lastSeq`；缺口被记录为需要 reload/replay 的恢复信号，不能无声跨过后继续宣称完整。
- `turn.completed.message` 直接形成权威 assistant 投影并 upsert stable row。
- `turn.failed` 保留 activeTurn 的 input/context/skill 形成可重试 failed row。
- 如果稳定 terminal event 已完成 Turn，后到的 legacy `result` 只做幂等核对，不重复追加。

当前后端没有 replay endpoint。断线时先保留 lastSeq 并重新加载 persisted transcript；稳定 replay API 到位后，stream client 可携带 lastSeq 请求缺失事件，而不改 UI row model。

## Persisted Transcript

目标 persisted DTO 为 Turn-oriented row，至少包含 turnId、user message、assistant message/status/proposals/createdAt。当前 message-array API 继续通过 legacy adapter 配对，但要隔离为 fallback，并对 orphan user/assistant、failed assistant、tool role 和空内容写明确定义。不能把数组相邻关系扩散到组件层。

## Chat Commands

ChatSwitcher 不独自持有不可同步的副本。Chat list/query 与 active chat lifecycle 由上层 controller 协调：创建后插入并选中，重命名后更新，清空 active chat 后 reload/清空 transcript，删除 active chat 后选择现存 Chat 或原子创建新 Chat。所有命令有 pending/error 状态，危险命令需要明确确认。

API 继续使用 repository ownership 查询。重命名、删除和清空返回足够的目标信息，前端只在成功响应后提交最终状态；失败保留原状态并显示错误。

## Rendering

`TranscriptRow` 固定渲染 user row 与 assistant row。assistant blocks 按文本、thinking、tool、confirmation 组合；Tool block 仅接收后端 display 或 allowlisted mapper 的产品文案。Markdown 复用现有安全渲染能力，链接协议必须限制，流式未闭合语法以纯文本/渐进结果降级，避免自制 regex parser 带来的嵌套语法错误和危险 URL。

## Compatibility And Rollback

legacy 和稳定 adapter 在测试夹具中并存，切换点只在 stream/event adapter，不复制两套 UI。若稳定协议接入出现重复、串会话或权限回归，可以关闭稳定 event 消费并回退 legacy adapter；持久化用户数据不回滚。ZOO-74 不引入数据库 migration。

