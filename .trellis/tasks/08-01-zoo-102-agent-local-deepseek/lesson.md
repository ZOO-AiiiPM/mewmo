# Lessons: ZOO-102 Agent 本地 Docker 验收：DeepSeek 官方模型（不影响 Workflows）

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## 结论

- **本地隔离环境基础设施验收通过，模型请求配置随后纠正**：Agent 使用 DeepSeek 官方付费 API；`/health`、本地 Docker PG migration 与鉴权 SSE 均成功。首轮 `requested_model=deepseek-chat` 是错误配置，最终 Agent chat/deep-insight 必须直接请求 `deepseek-v4-flash`。Workflow provider/model 与 `deploy/worker/.env.worker` 零改动。
- 首轮 env 曾指向远端 Neon，已在冒烟前识别并按安全指令停止，未发鉴权请求；orchestrator 更正为专用本地 Docker DB 后重跑成功。
- 完整 sanitized 证据见 `research/validation-evidence.md`。

## 观察 / 踩坑（待 curation）

1. **Agent 本地 `DATABASE_URL` 必须先确认指向本地 Docker PG 再冒烟**：识别 host/port（本地 `127.0.0.1:<自定义端口>`；远端 Neon `*.neon.tech`）。若指向远端，**严禁发鉴权 Agent 请求**，只允许只读连通/迁移检查并记录 blocker。每次 DB 命令前机械校验 host=127.0.0.1 & port=<固定本地端口>，不打印凭据。
2. **旧 thinking env 已移除**：中间版本加入过 `AGENT_CHAT_THINKING_LEVEL=low`，但最终契约由每次请求的持久 toggle 固定映射 `low/high`；保留全局 env 会形成看似可配置、运行时实际不读取的假开关。
3. **auth**：除 `/health` 外所有路由要 HS256 identity token（sub/sid/source=web_bff，issuer/audience 默认）。本地冒烟用 `signIdentityForTest` 同参数短期 token 即可。
4. **真实冒烟数据前提**：`POST /v1/chats/:chatId/*` 要求 chat 存在且属该 user（`requireOwnedChat` 查 `ai_chats`）。隔离库为空时需注入最小 test user + demo chat（显式 test 标识）；不读/写真实用户数据。这是本地隔离库验收的合法种子，不影响生产。
5. **`provider=primary` 不代表 provider 是 primary**：`packages/ai/src/runtime/env.ts` 把单一 provider 硬编码叫 `primary`；真正 provider 看 `AI_PROVIDER`。
6. **Prisma SQL 字段**：usage 表列为 `requested_model`/`response_model`（snake_case）。
7. **monorepo 约定（复用 gotchas）**：`pnpm install` 必须在根目录。
8. **进程清理纪律**：启动/停止必须精确 PID；停止后复核端口释放、无残留 `tsx src/index.ts` 进程。

## ZOO-111 Web 流式回复停滞

### Root cause

- **原 RAF-only 诊断不能解释 clean EOF 后永久卡住，已撤回为事故根因**：`sendAndStream` 正常返回后，`performSend` 会直接 `commitRow(terminal)`，不依赖 RAF。RAF 被暂停只能解释流仍打开时的 stale intermediate projection。
- 已确认一个穿过完整 terminal path、且与现场证据一致的失败：客户端已经解析到 authoritative `turn.completed` 后，trailing `result`/EOF 的 body read 仍可能抛 transport error。旧 `performSend.catch` 忽略已有 `finalTurn.terminal`，用 streamed partial blocks 新建 failed row，覆盖 UI 的完整完成态。HTTP 200 只证明 response headers 成功，不证明 body clean EOF；因此该路径可与 Agent/DB/Langfuse 全部成功同时出现。

### Deterministic reproduction

1. 构造 HTTP 200 `Response` + SSE `ReadableStream`；第一次 body read 返回 `turn.started(seq=1)`、partial delta `(seq=2)`、带完整答案的 `turn.completed(seq=3)`。
2. 第二次 body read 抛 `TypeError("terminated while reading response body")`，模拟 terminal event 后的 trailing EOF/transport failure。
3. 旧 lifecycle 会进入 `performSend.catch` 并把 partial blocks 写成 failed row；修复后的实际 parser → accumulator → settlement runner 保留 `terminal.status=completed` 与完整 authoritative text。terminal 之前的同类 transport error 仍 reject。

### Fix and evidence

- 新增 `conversation-stream-lifecycle.ts` 并由 `performSend` 实际调用：统一消费 legacy/stable events；若 transport error 发生在 terminal 之后，返回 authoritative terminal 给原 direct `commitRow` 路径；terminal 之前仍抛错并保留原 retry/error 行为。
- `live-row-scheduler.ts` 保留为流打开期间的投影修复：RAF batching 增加 100ms max-wait，并用 cycle token 隔离调度轮次。Regression 覆盖 `schedule A → fallback → schedule B → stale A RAF`，证明 stale A 不会消费 B 或取消 B fallback。
- Focused suite：5 files / 29 tests passed，包括真实 `Response`/`ReadableStream` 的 terminal-then-EOF-error lifecycle。
- `pnpm --filter @mewmo/web lint` passed；`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` passed。

### Remaining uncertainty

- 已确定性证明 terminal 后 transport error 会产生永久 partial/failed UI，并完成修复；但该具体 incident 没有保留下来的浏览器 body-read error telemetry，不能反向证明这一次请求一定走了该路径。
- 本轮 browser runtime 无可用浏览器实例；虽然 3100/3101 监听进程存在，但执行 sandbox 不能访问其 loopback socket，因此未取得真实页面交互证据。需要 orchestrator 在可用浏览器中补验：发送回复后切到后台超过 100ms再返回，确认文本追上、terminal cursor/stop control 消失且 composer 可继续发送。

## ZOO-112 深度思考 one-shot 与独立展示

> 更正：产品定义随后确认 Deep Thinking 不是 one-shot，而是持久开关。下方 one-shot 方案属于已被替换的中间实现，不得提升为 spec。

### Root cause

- `ChatInput` 原先把 one-shot 消费绑定在 `await onSend()` 成功返回之后。普通 append 当前同步返回，但 edit-and-resend 会等待 truncate；期间按钮仍保持选中，也没有 pending guard，UI 状态和“发送动作已被接受”的生命周期不一致。异常路径也没有显式恢复契约。
- `AssistantRow` 虽已收到独立 `thinking` block，却逐块渲染为 `<details>`，因此 thinking 与 final answer 仍处于同一内容序列，没有独立区域的高度、滚动与流式状态边界。
- 两个入口按钮继承 `--ink-soft`；暗色主题下 spark 图标对比不足，没有为 PrototypeIcon 指定跨主题的语义前景色。

### Fix and evidence

- one-shot 发送现在先乐观消费 thinking；`onSend` 返回 `false` 或抛错时恢复，并用 pending ref 防止异步接受窗口内重复提交。payload projection 独立保留 `skillId` 与 `thinking`，测试证明第一轮可同时携带两者、第二轮默认省略 `thinking`。
- render projection 将所有 thinking block 汇入独立“深度思考”区域，final/tool/confirmation blocks 继续走原内容层；区域使用 `min-height` + `max-height`、内部 `overflow-y: auto`，流式时自动跟随底部。没有 thinking content 时不创建空区域。
- 深度洞察/深度思考继续使用 PrototypeIcon；idle/hover/active 使用 `var(--ink)`，disabled 沿用同一语义前景色加 opacity，未新增固定主题色。
- Agent Web focused suite：11 files / 51 tests passed；Web lint、Web TypeScript、theme check、`git diff --check` passed。

### Test facility and remaining verification

- 当前 Vitest/Vite 按 Web tsconfig 的 `jsx: preserve` 收集测试，直接 import `AssistantRow.tsx` 会在 import analysis 阶段失败；仓库也未安装 jsdom/happy-dom/testing-library。组件源码/CSS断言仅作为 wiring/layout 辅助，主要行为由纯 `assistantPresentation` projection 测试覆盖 streaming、terminal、final 分层与无 thinking 分支。
- v1 未新增 thinking 持久化；刷新仍只使用现有 persisted final answer。真实 DeepSeek SSE 与深浅主题下 idle/hover/active/disabled 的浏览器视觉验收交由 orchestrator 完成。

### Persistent low/high correction and real evidence

- 发送后不再清除 `thinking`；只有用户再次点击按钮才关闭。普通请求固定为 `low`，开启固定为 `high`，Skill 选择不改变该映射。
- DeepSeek Agent purposes 使用 Responses API；两次真实请求均收到 `turn.completed`。low 轮 provider reasoning usage 为 0；high 轮返回独立 reasoning delta 且 usage reasoning 非 0。
- Langfuse development 两条 generation 已分别显示 `modelParameters["reasoning.effort"] = low/high`；这证明请求档位，不能用 low 轮 reasoning token 0 反推档位未发送。
- **撤回错误修复**：此前为让 Langfuse 显示 `deepseek-v4-flash` 而给 Pi Responses adapter 增加 `response.model` patch，掩盖了请求仍使用无效 `deepseek-chat` 的事实。该 patch 已删除；正确修复是让 `AI_MODEL_AGENT_CHAT` / `AI_MODEL_DEEP_INSIGHT` 直接请求 `deepseek-v4-flash`。
- Langfuse observation `e000a5ac41070ec3` 来自错误请求配置加 adapter patch，只能证明被修饰后的观测字段，不再作为最终模型验收依据。最终验收必须重新取得未修改 Pi adapter、请求 model 为 `deepseek-v4-flash` 的 observation。
- 正确修复后的真实证据：未修改 Pi adapter，Agent 出站 model 直接为 `deepseek-v4-flash`；HTTP 200 并收到 reasoning stream 与 `turn.completed`。本地 usage 记录 `requested_model=deepseek-v4-flash`、reasoning 24；Langfuse observation `1781d89537fad031` 显示 `model=deepseek-v4-flash`、`reasoning.effort=high`、reasoning 24。
- 真实 tool-call 顺序覆盖 reasoning → tool start → tool result → 后续 reasoning → final → `turn.completed`；连续 10 轮 bounded soak 为 10/10 HTTP 200、10/10 terminal、无 transport/error，且 terminal 后仍有 legacy `result` 与 clean EOF。
- localhost 连续两轮 high 的非视觉行为通过：发送后 toggle 均保持开启；每轮过程 `<details>` 与 final region 是独立兄弟节点；第二轮完成后 composer 恢复可用。深浅主题与图标/布局视觉效果由用户验收。

### ZOO-129 Agent execution budget

- DeepSeek `agent.chat` and `agent.deep_insight` now resolve to `maxTokens=65_536`; the mocked Responses transport confirms both low and high requests send `max_output_tokens=65_536`. Workflow model definitions remain unchanged.
- Agent service defaults now use 12 provider steps and a 120-second per-provider timeout. Existing Zod upper bounds remain the operational limits.
- The tracked deployment example and gitignored local `.env.agent` were both updated to `12 / 120000`; the isolated Agent was restarted on `127.0.0.1:3102` and `/health` returned `{"ok":true}`.
- Verification: focused 2 files / 11 tests; full `@mewmo/ai` 6 files / 35 tests; full `@mewmo/agent` 14 files / 112 tests; both package lint and TypeScript builds; `git diff --check` all passed.

### Final single-layer timeline and history projection

- Runtime 复用同一个 sanitized 事件出口累计有序 generation/reasoning/Tool blocks，并写入已有 `AiTurn.output.transcript` JSON；`thinking` 在 begin 时持久化，complete 时 merge blocks，不改 Prisma schema。
- Repository 只允许 public block 字段进入历史 DTO；raw Tool args/result 被丢弃，low reasoning 在 API 边界删除。Web 对 history 继续复用 `AssistantBlock` 与 terminal final reconciliation。
- ToolGroup 与二级“查看详情”已删除；Tool 详情直接展示，完成后保留语义 icon。过程 summary 的 caret 在最左，completed 自动折叠，failed/stopped 保持展开，耗时只在时间边界完整时显示。
- check follow-up 修复了两个边界漏洞：low reasoning 必须在 Agent SSE public boundary 同时过滤 stable/legacy event，但 runtime usage、Langfuse 与持久 process 保留；Tool completion details 必须与 start details 保序去重合并（最多 8 条），不能覆盖查询/目标参数。自动验证更新为 13 files / 91 tests passed；Agent/Web lint、相关 TypeScript、theme、diff check 全过。localhost browser 无登录态，真实两主题视觉与 computed marker 仍待用户验收。
