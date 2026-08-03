# ZOO-102 Agent 本地 Docker 验收：DeepSeek 官方模型（不影响 Workflows）

## Goal

在独立 `mewmo-agent` AO workspace 中完成 Agent 本地 DeepSeek 官方 Responses 基线，并在同一交付单元内修复验收发现的 ZOO-111 流式 terminal 对账与 ZOO-112 深度思考/执行时间线问题。AI Workflows 的 provider/model 与 Production 始终不在范围内。

## 背景（事实源）

- Agent 是常驻 Fastify 服务（`apps/agent`），入口 `src/index.ts`，绑定 `config.AGENT_HOST`/`config.AGENT_PORT`，`/health` 无需鉴权返回 `{ ok: true }`。
- 除 `/health` 外所有路由要求 `Authorization: Bearer <HS256 JWT>`，由 `AGENT_IDENTITY_SECRET` 签发，issuer/audience 默认 `mewmo-web`/`mewmo-agent`（`src/identity.ts`，`signIdentityForTest` 用于测试签 token）。
- AI Runtime（`packages/ai/src/runtime/env.ts`）原生支持 `AI_PROVIDER=deepseek`，对应 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_BASE_URL`（缺省 `https://api.deepseek.com`），聊天/深度洞察模型走 `AI_MODEL_AGENT_CHAT`/`AI_MODEL_DEEP_INSIGHT`。
- Agent 配置校验在 `apps/agent/src/config.ts`（envSchema），`AGENT_IDENTITY_SECRET` 至少 32 字符；思考档位由每次请求的持久 `thinking` 开关决定，不再提供会产生冲突的全局 thinking-level 环境开关。
- 本地环境文件 `deploy/agent/.env.agent`（gitignore，mode 600）仅含 Agent process 的配置与 DeepSeek 凭据；不含 Workflow 模型变量（`AI_MODEL_RECOMMENDATION`/`AI_MODEL_NOTE_INSIGHT`/`AI_MODEL_SUMMARY`/`AI_MODEL_EMBEDDING` 等）。
- **本地 DB 指向（更正后）**：orchestrator 已注入 ZOO-102 专属**本地 Docker PostgreSQL** `127.0.0.1:55432`（库 `mewmo_zoo102`）与本地 Redis `127.0.0.1:56379`，与既有容器隔离、不动既有容器。先前一版 env 曾指向远端 Neon，已在冒烟前识别并停止（未发鉴权请求）。
- 本机已有 Docker 容器（PostgreSQL 多实例 + Redis），ZOO-102 要求只读复用/隔离使用，不停止/重建/删除。
- ZOO-111 与 ZOO-112 是 ZOO-102 验收中发现的 Sub-issue，按协作规则复用本任务的 AO session/worktree/branch/未来 PR；ZOO-128 是后续独立顶层 Feature，不进入本工作树。

## 范围

- 复用当前本机 Docker PostgreSQL/Redis，先做只读连接与端口验证，不停止或重建已有容器。
- 为 Agent 本地进程配置 `AI_PROVIDER=deepseek`、DeepSeek 官方 base URL、Agent chat/deep-insight 模型与本地密钥。凭据只进入 gitignored 本地 env 文件，不写入 Git/Linear/日志/截图/进程参数。
- 安装/复核依赖与 Prisma client，执行 migration（deploy/status 针对本地隔离库 `mewmo_zoo102`）。
- 启动 Agent 服务并验证 `/health`。
- 使用合法短时身份 token 完成一次真实 Agent chat/SSE 冒烟，确认实际 provider/model；记录失败证据与 blocker。
- **前置安全闸（关键）**：任何鉴权 Agent 冒烟前必须机械校验 Agent `DATABASE_URL` 指向**本地 Docker PostgreSQL**（host 为 `127.0.0.1`，port=55432）；若指向远端库（如 Neon `*.neon.tech`），**不发任何鉴权请求**，立即停止并记录 blocker。
- 修复 ZOO-111：Web 以 authoritative `turn.completed` 结算，后续 legacy result/EOF/transport error 不得回退完成态；保持长回复的流式 UI bounded，不再因逐 delta 重解析产生主线程卡死。
- 修复 ZOO-112：持久 low/high thinking 开关、真实 reasoning usage、单层执行时间线、Tool 产品化详情、terminal/failure/stop 状态与耗时、列表 marker、Solar icon 及历史 session 过程恢复。

## 非目标

- 不修改 `deploy/worker/.env.worker`、AI Workflows 的 provider/model、Cron 或自动化配置。
- 不部署 Production、不自动 push/merge；当前 Sub-issue 不创建新的 session/worktree/branch/PR。
- 不停止、删除或重建已有 Docker 容器。
- 不把本地密钥（尤其 `DEEPSEEK_API_KEY`、`AGENT_IDENTITY_SECRET`、`DATABASE_URL`）写入任何跟踪文件或输出。
- 不改 Workflow 定义或用 Workflow 模型变量污染 Agent 本地环境。
- 不在当前 worktree 实现 ZOO-128 的来源引用/预览/跳转，也不设计触屏交互。

## 验收标准

- [ ] Agent 独立本地环境明确使用 DeepSeek 官方付费 API（`AI_PROVIDER=deepseek` + 官方 base URL + 模型）。
- [ ] Workflow 相关环境（`deploy/worker/.env.worker`）与模型变量在 Git diff 中无改动。
- [ ] PostgreSQL/Redis 前置只读检查通过，Agent `/health` 可访问（HTTP 200，`{ ok: true }`）。
- [ ] 依赖已安装、Prisma client 已生成、migration status 结果已记录。
- [ ] 至少一次真实带鉴权的 Agent 请求得到可验证结果，或形成准确 blocker（附 sanitized 证据）。
- [ ] 配置文件均被 gitignore，`git status`/diff 不含任何凭据值。
- [ ] ZOO-111 terminal settlement、长回复流式更新与多轮 Tool soak 不再卡死。
- [ ] ZOO-112 的模型、时间线、状态、图标、Markdown 与历史恢复满足下方最终产品契约。

## Notes

- ZOO-102 的原始本地基线已经扩展为包含 ZOO-111/ZOO-112 验收修复的同一交付单元；产品代码改动只允许服务这两个 Sub-issue。
- 所有证据一律 sanitize，凭据值绝不落盘或打印。
- Complex task → 需 `design.md` 与 `implement.md`，并在 `task.py start` 前完成 review gate。

## ZOO-111 / ZOO-112 最终产品契约

### 模型与开关

- Deep Thinking 是 composer 持久开关：普通请求显式使用 `low`，开启后使用 `high`；连续发送、成功、失败、停止、重试和 Tool 调用均不自动关闭，并与 Skill 独立。
- Agent 的 DeepSeek chat/deep-insight 直接请求官方 Responses API 的真实 model id `deepseek-v4-flash`；不得修改 Pi 官方 adapter 或用 `deepseek-chat` 伪装响应模型，Workflow 不迁移。
- 普通 `low` 的 reasoning 继续进入 usage/Langfuse，但不向用户展示；只有用户开启开关后的 `high` reasoning 进入深度思考片段。

### 单层执行时间线

- 一个 `agent.turn` 内严格按事件原序展示：generation → reasoning → Tool start/result → 后续 generation/reasoning/Tool → final generation。
- 过程区只有一层折叠。删除“已完成 N 步操作”的 Tool 聚合层，也删除每个 Tool 的二级“查看详情”；工具调用期间直接展示脱敏后的产品化参数、状态与结果。
- 中间 generation 不加“模型输出”标题或 icon，直接按普通 Markdown 对话显示。连续 reasoning delta 合并为一个深度思考片段；被 generation 或 Tool 打断后，后续 reasoning 另起片段。
- Tool 始终保留语义 Solar icon：通用 Tool 使用 `sledgehammer-linear`，Web Search/Fetch 使用 `magnifer-linear`，知识库/工作区搜索使用 `library-linear`；执行中使用 shimmer，完成后不替换成勾号，失败时显示错误色。
- 深度思考片段使用灯泡 icon 与左侧引用线；整个过程折叠标题不使用 icon。

### 折叠、耗时与 terminal

- 折叠箭头固定在最左侧。运行中标题为“思考中”，默认展开；用户可手动折叠，后续事件不得强制重新展开。
- 折叠标题与最终回答正文使用同一 assistant 内容列左边界；assistant 容器必须撑满内容列，不能因后置 `align-self` / `align-items` 规则收缩后再用偏移量补偿。
- 外层折叠只控制 final 之前的 generation、reasoning 与 Tool，不绘制竖线或 icon。只有 reasoning 正文使用左侧引用线；中间 generation、Tool 与 final 均不进入引用线。
- reasoning 流式标题为“深度思考中”，结束后为“思考过程”，标题保留 bulb icon；正文缩进与 Tool 详情的内容列一致，不增加 reasoning 二级折叠。
- 执行过程中的 generation、reasoning 标题/正文、Tool 标题/详情统一为 `12px`、统一行高与同一档灰色；仅运行 shimmer 和错误状态例外。final 保持正常正文 `13.5px` 与主文字色。
- 时间统计整个 `agent.turn`，从 `turn.started` 到 `turn.completed`，包含 generation、reasoning 与 Tool 执行。
- 最终 generation 在完成且确认不再调用 Tool 后进行一次前端 reconciliation：移到过程区外作为最终回复，同时自动折叠前序过程，标题显示“已完成 · N 秒”。这不是页面刷新，不能闪烁或丢内容。
- final 与 completed 过程区之间显示一条低对比度、与 assistant 内容列等宽的分割线；仅存在 final 时显示，不添加“最终回答”标题、卡片或背景。
- 失败不自动折叠，显示“未完成 · N 秒”；用户主动停止不自动折叠，显示“已停止 · N 秒”。历史缺少完整时间时只显示 terminal 状态，不伪造耗时。
- Web 收到 authoritative `turn.completed` 后立即结算；其后的 `result`/EOF/transport error 不得让页面回到发送中或用 partial 覆盖完成态。

### 历史恢复

- 历史 session 默认折叠所有 completed turn；用户可逐条展开，展开状态不跨页面保存。
- 展开后直接显示完整 generation、允许展示的 reasoning 与 Tool 产品化详情，不存在二级“查看详情”。
- 历史恢复按 `AiSessionEntry.entrySeq` 合并同一 Turn 的全部 assistant/tool entries，复用现有 JSON 持久化能力与 `AssistantBlock`，不新增 DB schema。
- Turn 必须持久化用户当轮 `thinking` 选择；high Turn 切换会话或刷新后恢复真实 reasoning，low Turn 即使 provider 返回 reasoning 也不得在历史 UI 暴露。
- 历史 API 不返回 raw Tool args/result；只有已脱敏 public projection 可以进入历史 UI。

### 相关但独立的交付

- 来源引用、Hover Preview 与跳转属于独立顶层 Issue ZOO-128；它等待 ZOO-112 完成后使用自己的 AO session/worktree/branch 实现，不与本任务并发修改 transcript 文件。
- 本任务暂不设计触屏交互。

### 验收补充

- [ ] 过程 generation 与 final 的 Markdown 无序列表均显示真实圆点、有序列表均显示真实数字，嵌套列表保留缩进，换行正文与文字列对齐。
- [ ] “思考中 / 已完成”与 final 首字严格左对齐；reasoning 引用线只覆盖 reasoning 正文，final 不进入引用线；存在 final 时两者之间显示低对比度分割线。
- [ ] 过程内 generation、reasoning、Tool 的常态颜色、字号与行高一致；reasoning 标题按流式/终态显示“深度思考中 / 思考过程”，正文缩进与 Tool 详情一致。
- [ ] 深度思考开关与片段的灯泡 icon、所有 Tool 语义 icon 在深浅主题及 idle/hover/active/disabled 状态可见。
- [ ] 运行、成功、失败、停止四种状态的标题、折叠行为与总耗时符合上述契约。
- [ ] high/low 各完成一轮真实请求；即时 UI、刷新、切换 session 后的过程与 final 分层一致。
- [ ] Tool 详情只有一层且始终是 sanitized public projection；无聚合计数层、无二级“查看详情”。
