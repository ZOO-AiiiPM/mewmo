# RSS Cron、首次订阅即时抓取与同步剪藏设计

## 结论

ZOO-35 只调整内容抓取机制，不重做 AI 产品体验。RSS 的后续更新改为服务器一次性 Cron；首次订阅由 Web 在当前请求内完成一次有界抓取，让用户无需等待下一分钟；剪藏正文也由 Web 同步抓取。Feed、Clip 抓取不再经过 BullMQ，但现有 AI Summary Worker、Redis 和 `packages/ai.summarizeArticle()` 暂时保留。

`summary` 是 AI 生成结果的专用字段。RSS description、Atom summary、网页 meta description 都是来源元数据，只能用于 `excerpt` 或正文降级，任何抓取路径都不得把它们写进或覆盖 `summary`。

## 背景

当前系统把三个不同问题混在同一组 Worker 中：RSS 定时调度、Feed/Clip 内容抓取、AI Summary。Feed 与 Clip 是低频、可由用户请求或服务器 Cron 明确触发的抓取任务；为它们维持 BullMQ 常驻消费者和多套 Web fallback 增加了 Redis 请求、锁、重试和状态分支。AI Summary 的内容结构和 Sidebar 体验尚未讨论完成，不能为了简化抓取机制提前确定 AI 数据模型。

本设计因此拆开两条边界：

- ZOO-35 负责何时抓内容、在哪里抓、失败如何恢复。
- 独立 AI Issue 负责 AI 解读包含什么、怎样保存、Sidebar 怎样显示生成中和失败、最终是否删除 Summary Worker 与 Redis。

## 范围

ZOO-35 包含：

- 新增订阅后，Web 立即抓取一次 RSS/Atom 并保存可用条目。
- 后续 RSS 更新由 Linux Cron 每分钟启动一次 one-shot runner。
- Cron 直接查询数据库并处理到期 Feed，不使用 Feed BullMQ 队列。
- 剪藏创建和刷新由 Web 在 12 秒边界内同步抓取，不使用 Clip BullMQ 队列。
- 删除常驻 Feed Worker、Clip Worker和内部 Feed scheduler。
- 保留现有 Summary Worker、AI 队列和 `packages/ai` 接口。
- 保证所有来源简介只写 `excerpt`，不污染 AI `summary`。

ZOO-35 不包含：

- AI Sidebar 的区域、文案、转圈或自动刷新设计。
- `summarizeArticle()` 返回字符串还是结构化对象。
- AI 评价、观点、局限与启发的 Prompt 设计。
- `aiStatus`、重试次数或 AI 结果版本等 Schema。
- 对话能力迁往 `apps/agent`。
- 完全移除 Redis、BullMQ 或 Summary Worker。

## 架构

```text
Web
├── 首次订阅：有界抓 RSS，立即保存条目
├── 剪藏创建：有界抓网页，成功后保存
└── 剪藏刷新：有界抓网页，成功后更新

Linux Cron（每分钟）
└── one-shot Feed runner
    ├── 查询到期 Feed
    ├── 抓 RSS 与文章正文
    ├── 更新 FeedEntry
    └── 沿用现有队列触发 AI Summary 后处理

常驻 Worker
└── 暂时只保留现有 AI Summary Worker

PostgreSQL
└── 内容、Feed 抓取状态与时间
```

Web 和 Cron 共享数据库约束，但承担不同用户体验。Web 首次抓取优先尽快出现文章；Cron 不在用户请求内，可以继续完成较深的正文抓取和现有 AI 后处理。

## 首次订阅

用户提交订阅后，API 先验证 ownership 和输入，再创建 Feed。创建成功后在同一请求中抓一次 RSS/Atom，网络上限为 15 秒。初次路径解析最新条目并保存 RSS 已提供的标题、链接、正文、作者和时间，但不逐篇访问最多十个外部网页；逐篇深度抓取最坏会把一次 Web 请求放大到两分钟以上，反而比等待 Cron 更差。

初次保存遵守以下规则：

- 最多保存最新十篇条目。
- RSS/Atom 的 description 或 summary 映射到 `excerpt`。
- Feed 提供完整 content 时可直接作为初始正文；只有 description 时允许作为正文降级。
- `summary` 必须为 `null`，不能使用来源简介占位。
- Feed 抓取成功后仍写 `lastFetchStatus = queued`，并保持 `lastFetchedAt = null`；初次 Web 抓取只解决用户立即看到条目，下一分钟 Cron 仍需深度补全正文并触发现有 AI 后处理。
- Feed 抓取失败时保留已经创建的订阅，写 `lastFetchStatus = error` 和错误信息；API 返回订阅记录及首次抓取失败状态，后续 Cron 自动重试。

前端不再轮询十五秒等待后台队列。API 返回后立即关闭新增弹窗并打开该订阅；成功时已经有初始文章，同时界面可以根据 `queued` 表示后台还会补全，失败时显示可恢复错误。重复添加已有订阅时返回已有记录，不重复创建或发起并行抓取；已有记录处于 error/partial 时只标记为下一次 Cron 可重试。

## 后续 RSS 更新

宿主机每分钟通过 `flock` 启动一次 one-shot runner。`flock` 只防止两轮 Cron 进程重叠，数据库条件更新仍是不同入口并发时的最终保护。

每轮最多选择五十个 Feed，并按以下顺序判断：

- `queued`：立即处理。
- `idle` 或 `success`：`lastFetchedAt + refreshInterval` 已到期才处理。
- `error` 或 `partial`：上次开始至少五分钟后重试。
- `fetching`：`lastFetchStartedAt` 超过五分钟才视为旧进程已崩溃并接管。

网络请求本身保持 15 秒超时；五分钟不是等待网络，而是进程崩溃后数据库永久遗留 `fetching` 的恢复边界。领取时用条件 `updateMany` 把 Feed 改成 `fetching` 并记录本次 `lastFetchStartedAt`。完成或失败时必须携带同一时间戳更新，旧进程不能覆盖新一轮结果。

Cron 对每个 Feed 隔离错误：一个源失败不会终止整批。成功条目先写数据库，再沿用现有 Summary/Tag producer 触发当前 AI 后处理。首次 Web 已经创建、但 `summary` 仍为空的条目也必须在 Cron 深度补全后投递；不能只按 `created = true` 判断，否则首次订阅文章永远不会进入现有 AI 流程。队列使用稳定 job ID 去重。队列提交失败记录为 `partial`，后续 Cron 可补投递；本 Issue 不改变 AI 输出或消费方式。

初次 Web 抓取已经创建的条目会在后续 Cron 中被正文补全。FeedEntry upsert 更新来源字段时不得把缺失的输入解释为 `summary = null`，否则会擦除已经完成的 AI 结果；抓取代码完全不接管 `summary` 的写权限。

## 同步剪藏

剪藏创建在 Web 请求内调用现有 `fetchClipFromUrl()`，沿用 12 秒 AbortSignal。API 先检查当前用户是否已有相同 normalized URL；不存在时抓取网页，只有抓取成功才创建 Clip。超时返回 504，其他抓取失败返回 502，不创建标题占位或空正文记录。

成功保存的来源数据包含正文、标题、封面、favicon、作者、发布时间和 `excerpt`。网页 meta description 只能进入 `excerpt`；`summary` 保持 `null`，随后以 best-effort 方式沿用现有 `addSummaryJob()` 触发当前 AI 流程。Redis 暂时不可用不能回滚已经成功保存的剪藏。

剪藏刷新也在已认证用户请求内同步执行：先把抓取状态标记为 `fetching`，成功后更新来源字段并标记 `success`，失败后标记 `error`。刷新不得用网页 description 覆盖既有 AI `summary`；成功后重新提交现有 Summary 任务。前端等待这次请求完成，不再轮询 Clip 抓取状态。

并发创建仍由 `[userId, normalizedUrl]` 唯一约束兜底。若两个请求同时抓完，P2002 分支返回最终已存在的记录；软删除记录仅在抓取成功后恢复。

## Worker 与 Redis 边界

常驻 runtime 删除 Feed Worker、Clip Worker和 Feed scheduler，只保留当前真正消费 AI Summary 队列的 Worker。Feed/Clip 队列名、producer、消费者和只服务它们的测试一并删除，避免代码继续暗示这些任务仍走 Redis。

Redis 不能在 ZOO-35 中完全移除，因为现有 RSS/Clip AI Summary 仍依赖它。Tag 与 Embedding 是否保留、是否有消费者也归独立 AI Issue 审计；本 Issue 不借机定义其最终状态。

## 部署

`apps/worker` 增加一次性 `cron:feeds` 入口，执行完本轮后断开 Prisma 并退出。Docker Compose 增加 `feed-cron` profile/service，复用同一镜像和环境变量；常驻 `worker` 继续运行 AI Summary Worker。

部署顺序：

1. 更新镜像和 Compose。
2. 手动执行一次 `docker compose -f compose.yml --profile cron run --rm feed-cron`。
3. 确认日志含本批次 selected/succeeded/skipped/failed 统计。
4. 确认旧 Feed scheduler 和 Feed Worker 已随新代码停用。
5. 加入每分钟 `flock` crontab。
6. 验证新订阅即时出现条目，以及到期订阅由 Cron 更新。

回滚时先注释新 crontab，再切回旧镜像，禁止新 Cron 与旧 Feed Worker 同时运行。

## 验收

- 添加有效订阅后，无需等待下一分钟，API 返回时数据库已有初始条目。
- 初次 RSS 请求失败时订阅仍保留，界面显示错误，后续 Cron 可以恢复。
- 后续更新只由 one-shot Cron 执行，不创建 Feed BullMQ job。
- 同一 Feed 的正常刷新不会并发；超过五分钟的遗留 `fetching` 能被后续 Cron 接管。
- 新文章的来源简介只在 `excerpt`，`summary` 在 AI 完成前为 `null`。
- 后续来源刷新不会擦除已有 AI `summary`。
- 剪藏成功后立即有正文；抓取失败不留下空记录。
- 剪藏创建和刷新不创建 Clip BullMQ job。
- 常驻 Worker 仍能处理现有 AI Summary；ZOO-35 不改变 Sidebar 输出结构。

## 最终边界

ZOO-35 完成后，只能声称 Feed/Clip 内容抓取退出了 BullMQ，不能声称 Redis 或 Worker 已完全删除。`summary` 仍然只代表 AI 结果；AI 结果内容、数据库结构、Sidebar 状态和最终运行位置必须等独立 AI Issue 讨论确认后再修改。
