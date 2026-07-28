# ZOO-61 Langfuse 可观测性与隐私

## Goal

在不改变 Agent 产品协议、不上传用户正文、也不让第三方故障影响请求的前提下，为实时 Agent 的每个 Turn 建立可定位的 Langfuse trace，使 ZOO-73 能核对模型调用、Tool、延迟、Usage、错误与重试。

## Background

- 当前 Production Runtime 没有 tracing；Langfuse 仅用于 `apps/ai-workflows/evals/live.ts` 的离线/在线评测。
- ZOO-70 已冻结 Conversation Event 协议并过滤 thinking、原始 Tool 参数/结果；ZOO-61 只能通过后端 hook 观察运行时，不能改变该 DTO。
- PostgreSQL `AiUsageEvent` 是产品 Usage 与成本账本；Langfuse 只是诊断副本，不能参与业务完成条件。
- 2026-07-25 更新后的 ZOO-61 Issue 和父 Issue 附件 Spec 已将首期范围收窄。2026-07-23 评论中的 Prompt Management、Dataset/Evaluator、Workflow/Automation tracing 和复杂 Dashboard 不属于本轮。

## Requirements

1. 每次非缓存 Agent Turn 创建一个 trace，关联 `chatId`、`turnId`、purpose、environment、release 和 HMAC 后的内部用户标识；不得发送 email。
2. 每次 AgentHarness 模型调用创建一个 generation，记录 provider、requested/response model、调用序号、latency、stop reason、token 和可验证 cost。不得记录 prompt、用户输入、模型正文或 thinking。
3. 每次 Tool 执行创建一个子 observation，记录稳定 Tool 名、toolCallId、latency、成功/失败；不得记录 args、partial result 或 result。
4. Turn 完成或失败时结束 trace，并记录公开错误 code、retryable、provider call count 和最终状态；错误 message 必须先脱敏，不能保存 provider 原始错误或 Secret。
5. 使用重新生成的 Langfuse Project key 完成真实配置。ZOO-61 必须在本地 Agent 产生一条可在 Langfuse 查询的 smoke trace；ZOO-73 在正式 main 镜像确定后把同一配置注入 Production Agent 并再次冒烟，不能只交付 adapter 或示例文档。
6. Langfuse 未配置、初始化失败、导出失败、超时或 shutdown 失败时，Agent 主请求与 PostgreSQL Usage 写入继续执行。观测错误只能产生不含 Secret/正文的受控服务端 warning。
7. Local 与 Production 使用显式 environment 和不同标记；Preview 不部署 Agent，也不注入 Production Langfuse key。关闭时使用 no-op adapter。
8. 部署文档只记录变量名与边界，真实 key 只写入 Git 忽略的本地/服务器环境文件或 Secret 管理，不写入代码、Linear、日志或测试证据。退出时尽力 flush/shutdown，但设置超时且不得卡住服务停止。

## Acceptance Criteria

- [ ] Fake observer 测试证明一个 Turn 对应一个 trace，多次模型调用对应多个 generation，Tool start/end 正确配对。
- [ ] generation 可见 latency、provider/model、stop reason、token/cost；字段可与同 Turn 的 `AiUsageEvent` 抽样核对。
- [ ] Tool span 只包含名称、ID、状态和时延，不包含参数、结果或笔记内容。
- [ ] 用户消息、页面 context、thinking、Tool args/result、email、API key 不出现在任何待导出的 observation payload。
- [ ] 未配置与故障 observer 的测试证明正常回答、Turn 完成和 Usage 不受影响。
- [ ] environment/release 配置与 user HMAC 行为有单元测试；相同用户稳定、不同 salt 不同、原始 userId 不可见。
- [ ] 使用重新生成的 key 完成本地真实 smoke，在 Langfuse 中可按 chatId/turnId 查询 trace、generation 和 Tool observation，并保存不含 Secret/正文的验收证据。
- [ ] Agent 相关 lint、test、build 和项目 `pnpm verify` 通过。
- [ ] ZOO-73 故障注入验证 Langfuse 不可用时 Agent SSE、Tool 与 Usage 仍正常，并在正式 main 镜像部署阶段完成 Production 配置和 smoke。

## Out Of Scope

- Workflow 与 Automation tracing。
- Prompt Management、Dataset、Evaluator、Experiment、评分 UI 和 Dashboard 设计。
- 前端 Langfuse SDK、Conversation DTO 变更或 UI 改动。
- 上传用户 prompt、模型正文、thinking、笔记/剪藏正文、page context、Tool 参数/结果。
- 用户最终 Production 产品验收；代码、配置接线和 Production Langfuse smoke 仍由 ZOO-61/ZOO-73 负责完成。

## Risks And Deferred Items

- Pi provider 内部网络 retry 没有独立 lifecycle event；首期记录运行时配置的 max retries、模型调用序号和 Turn retryable 状态，不伪造精确的 provider retry 次数。
- 当前受控密钥索引没有 `LANGFUSE_*`；真实 smoke 只能使用用户重新生成并安全放置的新 key，不能复用此前已在对话中暴露的旧 Secret。
- ZOO-70、ZOO-74 尚未提交；ZOO-61 独立实现后由 ZOO-73 统一整合和验证，避免当前分支相互污染。
