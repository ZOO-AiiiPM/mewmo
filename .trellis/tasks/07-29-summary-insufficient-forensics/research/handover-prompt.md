# 原始交接 Prompt（总控 → 执行 Agent，2026-07-29）

> 本文件为总控提供的完整交接提示词原文，作为本任务的需求真相源。prd/design/implement 均由此派生。

你是 Mewmo ZOO-63 最终验收细节问题的执行 Agent。你的任务是从 Production 证据出发，查明并修复以下异常：

一篇正文看起来完整的订阅文章，智能总结却以"原文信息不足，只说明能够确认的内容"开头。

最重要的规则：不要先改 Prompt，不要通过删除这句话或输出后处理来掩盖问题。必须先证明模型当时实际收到了什么输入，并区分"旧摘要对应旧/不完整正文"和"完整正文触发 Prompt 误判"。如果证据不足，停止并报告，不得猜测根因。

## 一、现场与范围

截图路径：

/var/folders/00/hzzb21nn4s33lfp5yqs068000000gn/T/codex-clipboard-65f7569b-7e0a-4708-95a0-22414fac6e25.png

目标文章标题：

"上线3个月、1200万DAU，WorkBuddy是怎么炼成的？"

截图表现：

- 中间阅读器展示了多段正文、图片和继续向下滚动的内容，视觉上不像空页面或登录页。
- 右侧智能总结以"原文信息不足，只说明能够确认的内容"开头。
- 摘要随后又准确提到了 WorkBuddy、CodeBuddy、2026 年 3 月公测、月活/日活、桌面端占比、Harness 等多项事实。
- 因此这不是普通的 summary_empty 或 Workflow failed，而是一个成功写入数据库的模型输出。

ZOO-63 当前已经 Done。本任务是其验收后的细节收口，不要自行重开、关闭或修改 ZOO-63 状态。确需写 Linear 评论时，先把草稿交给总控。

ZOO-83 是独立的 summary_too_long 遗留问题，不属于本任务。当前主工作树位于 `feature/summary-500-char-limit`，存在 5 项未提交修改：

- `.trellis/workspace/zoo/journal-1.md`
- `apps/ai-workflows/evals/offline.test.ts`
- `apps/ai-workflows/prompts/article-summary.zh.md`
- `apps/ai-workflows/prompts/summary-judge.zh.md`
- `apps/ai-workflows/src/workflows/summary.ts`

绝对不要修改、覆盖、stash、reset 或清理这个 dirty worktree。先运行 `git status --short --branch` 确认现场。需要修改代码时，使用基于最新 `origin/main` 的独立 worktree/分支；不要把 ZOO-83 的未提交长度调整带入本任务。

## 二、已经验证的代码事实

Production 验收记录中的 release 是 `bef01c1`。先核实目标 summary run 的实际 release，不要只看当前 dirty 文件。

Production `bef01c1` 使用的摘要 Prompt 可通过以下命令查看：

`git show bef01c1:apps/ai-workflows/prompts/article-summary.zh.md`

其中规则明确写着：

"正文信息不足时明确写'原文信息不足'，并只说明能够确认的内容。"

当前对应文件：

`apps/ai-workflows/prompts/article-summary.zh.md:12`

这意味着"原文信息不足"是模型根据模糊规则自行做出的判断，不是应用层预先检测出的结构化状态。

摘要输入链路如下：

1. `createAiRunService().getInput()` 从 `feed_entries.content` 读取正文：
   `packages/application/src/ai-run-service.ts:111`
2. Adapter 不做长度裁剪，直接把 `source.content` 传给 Summary Workflow：
   `apps/ai-workflows/src/adapters.ts:131`
3. `buildSummaryUserPrompt()` 只移除 script/style/HTML 标签和压缩空白，没有显式 `slice` 或 token 裁剪：
   `apps/ai-workflows/src/workflows/summary.ts:26`
   `apps/ai-workflows/src/workflows/summary.ts:53`
4. 阅读器同样渲染 `item.feedEntry.content`：
   `apps/web/src/app/(app)/knowledge-bases/page.tsx:921`

因此，"现在 UI 正文完整"能证明当前数据库正文完整，但不能单独证明原 summary run 当时使用的正文也是当前版本。

存在一个必须验证的数据一致性风险：

- Feed 更新已有 entry 时，`upsertSourceByFeedUrl()` 会更新正文并递增 `version`，但不会清空已有 `summary`：
  `packages/db/src/repositories/feed-entries.ts:113`
- Feed 补漏只查询 `summary: null` 的 entry：
  `apps/feed-ingestion/src/feeds/process-feed.ts:80`

这可能造成"正文后来变完整，但旧摘要仍保留"的 stale summary（陈旧摘要）问题。它目前只是高优先级假设，不是已确认结论。

Langfuse 默认会脱敏 Prompt 和正文，不能期待从 Trace 直接看到原文。可使用 runId、inputVersion、inputTokens、模型、release 和时间线作为间接证据：

`apps/ai-workflows/src/observability/langfuse.ts:188`

## 三、先做只读生产调查

使用项目已有的 Production 数据库连接方式，不得输出或复制 DATABASE_URL、API Key、用户正文或完整 userId。Production 数据库在根因确认前只允许 SELECT。

先按标题定位目标 `feed_entries` 记录。若查到多条，不得猜测；结合来源、URL、发布时间及截图中的"7 月 28 日 19:08"继续缩小范围。

可以使用以下只读 SQL 作为起点，但根据实际 PostgreSQL 环境调整：

```sql
SELECT
  id,
  user_id,
  title,
  url,
  version,
  length(content) AS raw_content_chars,
  length(
    trim(
      regexp_replace(
        regexp_replace(content, '<[^>]+>', ' ', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  ) AS approximate_visible_chars,
  left(summary, 120) AS summary_prefix,
  created_at,
  updated_at
FROM feed_entries
WHERE title ILIKE '%WorkBuddy%怎么炼成%'
  AND deleted_at IS NULL
ORDER BY updated_at DESC;
```

不要在终端、Linear 或最终报告中打印完整正文。仅记录：

- targetId 的脱敏形式或内部引用；
- 当前 version；
- raw/visible 字符数；
- 是否包含多个段落；
- summary 前缀；
- createdAt/updatedAt。

然后查询该目标的全部 summary run：

```sql
SELECT
  id,
  input_version,
  idempotency_key,
  status,
  attempts,
  output,
  error_code,
  error_message,
  created_at,
  started_at,
  completed_at,
  updated_at
FROM ai_runs
WHERE kind = 'summary'
  AND target_type = 'feed_entry'
  AND target_id = '<TARGET_ID>'
ORDER BY created_at DESC;
```

继续查询这些 run 对应的 Usage：

```sql
SELECT
  run_id,
  provider,
  requested_model,
  response_model,
  input_tokens,
  output_tokens,
  cache_read_tokens,
  cache_write_tokens,
  created_at
FROM ai_usage_events
WHERE run_id IN ('<RUN_ID>')
ORDER BY created_at ASC;
```

使用项目的 `langfuse` skill 按 runId 或 targetId 查询对应 Production Trace，核对：

- environment；
- release；
- trace 时间；
- 模型及 response model；
- input/output tokens；
- 最终状态；
- 是否存在重试。

不要要求 Langfuse 返回原始 Prompt 或正文；当前隐私设计故意不导出这些内容。

## 四、按证据区分根因

必须明确落入以下一个或多个类别。

### 根因 A：旧摘要对应旧或不完整正文

支持证据包括：

- 产生当前 summary 的成功 run，其 `input_version` 明显早于当前 entry version；
- summary run 完成后 entry 又被 Feed 更新；
- 原 run 的 inputTokens 明显低于当前完整正文应有的输入量；
- 使用当前版本正文重新生成后，不再出现"原文信息不足"。

注意：entry version 也可能因已读/未读等非正文操作变化，因此不能仅凭版本差异下结论。必须结合更新时间、Feed 处理记录、inputTokens 和重新生成结果。

若确认属于这一类，修复正文更新与摘要失效/重跑语义。目标不是每次 Feed 刷新都无脑重算，而是：

- 只有标题或正文等摘要输入真正变化时才让旧摘要失效；
- 为新内容版本 enqueue 新 summary run；
- 内容未变化时不得反复清空摘要或制造重复 run；
- readAt 等非内容字段变化不得触发摘要重算；
- idempotencyKey 和 inputVersion 必须对应真正的摘要输入版本。

不要直接用 SQL 改 summary，也不要只给这一条文章人工覆盖一个结果。

### 根因 B：完整正文触发了 Prompt false positive

支持证据包括：

- summary run 使用的 `input_version` 与正文版本一致；
- inputTokens 和重建后的 normalized text 长度证明模型收到的是完整长文；
- 重新使用 Production Prompt + 同模型执行时，仍出现或高概率出现"原文信息不足"；
- 摘要本身能提取大量具体事实，说明输入并非空白或登录页。

若确认属于这一类，不要在输出后使用 `.replace("原文信息不足", "")` 之类的表面补丁。根因是 Prompt 把"信息是否充分"交给模型主观判断，并提供了一句高显著性的固定套话。

推荐的修复方向是把 source sufficiency（来源是否足够）变为确定性应用逻辑：

- 对空正文、极短正文、登录提示、人机验证、反爬页等已知坏输入做可测试的预检查；
- 输入通过预检查后，Prompt 明确告诉模型正文已经通过完整性检查，直接总结，不得输出"原文信息不足"等免责声明；
- 输入未通过时使用结构化错误或明确的产品状态，不让模型一边声称信息不足、一边生成看似正常的摘要；
- 不要为了本例设置标题、来源或 WorkBuddy 专用规则。

优先复用项目已有的 HTML/text 与 blocked-page 判断能力，不要再造一套互相漂移的正则：

`apps/feed-ingestion/src/feeds/feed-entry-content.ts:7`

### 根因 C：HTML 归一化破坏了模型输入

比较数据库原始正文与 `buildSummaryUserPrompt()` 实际产生的 normalized text，只输出长度、段落数以及头尾内容的 hash/脱敏片段，不输出全文。

重点检查：

- script/style 正则是否吞掉正文；
- `<[^>]+>` 是否因畸形 HTML 跨越过大范围；
- HTML entity、图片说明、段落边界是否全部丢失；
- UI renderer 能容错显示，但摘要归一化后文本是否大幅缩水；
- normalized text 是否只剩导航、标题或开头几段。

若属于这一类，应修复正文转纯文本的统一能力并增加真实结构的 HTML fixture。优先复用 `@mewmo/content` 已有能力，而不是给当前三个正则继续叠补丁。

### 根因 D：目标关联错误

确认截图显示的 feed entry ID、Sidebar context ID、summary run targetId 和数据库正文记录是同一条内容。

若 ID 不一致，沿 UI context/API 数据链修复，不得误判成模型问题。

## 五、受控复现

保存只读现场后，可以只对这一篇文章执行一次受控的"重新生成总结"：

- 先记录旧 summary、当前 entry version 和已有 run；
- 通过产品现有 `/api/ai/summary` 流程或 UI 刷新按钮 enqueue，不直接改数据库；
- 记录新 runId、inputVersion、inputTokens、release 和最终 summary；
- 不清理旧 run，不删除生产数据；
- 若一次生成无法区分随机模型波动，不要在 Production 连续重复写入。改用隔离环境对脱敏后的同结构输入做重复 Eval。

对比重新生成前后：

- 是否仍出现"原文信息不足"；
- 是否覆盖文章的关键事实；
- 是否出现幻觉；
- 是否完整句结束；
- 是否满足当前部署版本的长度限制。

## 六、测试要求

只有与实际根因相符的测试才应加入，禁止为预设方案堆测试。

至少补齐以下回归覆盖：

1. 一条真正不足的输入，例如登录提示或反爬页，仍不得产生幻觉。
2. 一条包含多个段落、实体、数字和结论的完整文章，摘要不得输出"原文信息不足"。
3. 若根因是 stale summary：
   - 内容真正变化时旧摘要失效并 enqueue 新版本；
   - 内容不变时不重复 enqueue；
   - readAt 等非内容变化不触发摘要重算。
4. 若根因是归一化：
   - realistic HTML 中的正文事实、段落和数字在 normalized input 中仍存在；
   - script/style/导航噪声被移除。
5. 保持 ZOO-83 当前长度修复工作完全独立，不修改或覆盖其 dirty worktree。

现有 Eval 数据只覆盖了一条明确的 insufficient 页面，没有覆盖"完整长文不得误报信息不足"：

`apps/ai-workflows/evals/datasets/summary-cases.json`

## 七、开发与验证流程

先加载 Trellis 上下文：

`python3 ./.trellis/scripts/get_context.py`

如需写代码，先使用 `trellis-before-dev` 读取目标 package/layer 的项目规范。不要未经总控同意新建或归档 Trellis task。

验证从最小范围开始：

- 相关 unit tests；
- `apps/ai-workflows` 或 `apps/feed-ingestion` 的目标测试；
- 对应 package lint/type-check；
- 必要时再运行更广的 verify。

不要修复无关测试或顺手重构。

代码完成后不要 merge、不要 push、不要改 Linear 状态。保留在独立分支/worktree，向总控提交验证报告等待下一步。

## 八、最终报告格式

最终必须报告：

1. 一句话根因，明确是 A/B/C/D 哪一类，是否存在复合根因。
2. 生产证据：目标 version、summary run inputVersion、inputTokens、时间线和 release；全部脱敏。
3. 为什么文章现在完整却会显示旧/错误摘要。
4. 修改的文件及每个修改对应的根因。
5. 单测、Eval、lint/type-check 的实际结果。
6. 对目标文章的受控重新生成结果。
7. 是否需要对其他历史 summary 做扫描或回填；只给数量和方案，不自行批量执行。
8. 仍未验证的风险。

如果无法访问 Production 或无法唯一定位目标记录，明确说明阻塞点，并返回已经完成的本地代码链分析和下一步只读查询，不得编造 Production 结论。

最重要的收尾要求：修复必须消除产生错误判断的机制，而不是把"原文信息不足"这几个字隐藏起来。
