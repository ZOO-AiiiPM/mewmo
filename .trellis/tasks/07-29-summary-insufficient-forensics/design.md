# 技术设计：摘要"原文信息不足"误报取证与根因修复

## 1. 边界与工作区

- 代码工作区：`.worktrees/qoder-session-20260729`（分支 `qoder/session-20260729`，基于 `bef01c1` = origin/main = 生产 release），所有代码修改仅发生在此。
- 主目录 ZOO-83 dirty 现场只读，永不触碰。
- Production DB：根因确认前只 SELECT；受控复现仅通过产品既有 enqueue 路径写入一次。

## 2. 取证数据流（调查阶段）

```
截图现场 (title + 2026-07-28 19:08)
   │ ① 定位
   ▼
feed_entries (id, version, content 长度指标, summary 前缀, created/updated_at)
   │ ② 关联
   ▼
ai_runs (kind=summary, target_id) → input_version / idempotency_key / status / output / 时间线
   │ ③ 关联
   ▼
ai_usage_events (run_id) → provider / model / input_tokens / output_tokens
   │ ④ 交叉核对
   ▼
Langfuse trace (langfuse skill, 按 runId) → environment / release / 重试 / tokens
```

关键推断规则：
- `input_version` vs 当前 entry `version`：差异是根因 A 的必要非充分条件（version 也会因 readAt 等递增，须结合更新时间与 feed 处理记录）。
- `input_tokens` vs 当前正文归一化后估算 token：原 run tokens 明显偏低 → 支持 A 或 C；与完整正文匹配 → 支持 B。
- 本地重建 normalized text：在 worktree 内用 `bef01c1` 版 `buildSummaryUserPrompt()` 对当前 DB 正文（脱敏处理，仅统计长度/段落/头尾 hash）重放归一化，判定 C。
- D 的核验：UI/API 链上 entry id 与 run targetId 一致性检查。

## 3. 根因判定矩阵

| 证据 | A stale | B false positive | C 归一化 | D 关联错误 |
|---|---|---|---|---|
| input_version < 当前 version 且中间有 feed 内容更新 | ✅必要 | ❌ | – | – |
| input_tokens ≈ 完整正文 | ❌ | ✅必要 | ❌ | – |
| input_tokens ≪ 完整正文，但 DB 正文当时已完整 | ❌ | ❌ | ✅必要 | – |
| 重放归一化后文本大幅缩水 | – | ❌ | ✅强 | – |
| run targetId ≠ UI entry id | – | – | – | ✅决定性 |
| 受控重跑（当前正文）不再误报 | ✅强 | ❌弱化B | 视归一化是否修复 | – |

复合根因可能存在（如 A+B），报告须分别给证据。

## 4. 修复设计（按根因分支，只实现被证实的分支）

### 4.1 根因 A：摘要失效/重跑语义

改动面：`packages/db/src/repositories/feed-entries.ts`（`upsertSourceByFeedUrl`）、`apps/feed-ingestion/src/feeds/process-feed.ts`、可能涉及 `packages/application` 的 enqueue 语义。

设计要点：
- 在 upsert 更新路径计算"摘要输入是否真正变化"（title/content 变更检测，建议 content hash 比较而非 version 比较）。
- 输入变化 → 清空/标记 summary 失效 + enqueue 新 run；输入不变 → 不动 summary、不产生重复 run。
- readAt 等非内容字段更新路径与内容更新路径隔离，不得触发重算。
- `idempotencyKey` / `inputVersion` 与摘要输入版本绑定（而非 entry 总版本），保证同一输入不重复跑、新输入必然新 run。
- 兼容性：不改 Prisma schema 优先；若必须加"内容版本"字段，走 migrate dev 并在报告中说明。

### 4.2 根因 B：sufficiency 判定确定性化

改动面：`apps/ai-workflows/src/workflows/summary.ts`、`apps/ai-workflows/prompts/article-summary.zh.md`、复用 `apps/feed-ingestion/src/feeds/feed-entry-content.ts` 已有 blocked-page/insufficient 判定（如需共享则考虑下沉 `@mewmo/content`，避免两套正则漂移）。

设计要点：
- 应用层预检查：空/极短/登录墙/反爬页 → 结构化错误或产品态（不进模型）。
- 通过预检查的输入：Prompt 明示"正文已通过完整性检查，直接总结，禁止输出'原文信息不足'类免责声明"。
- 与主目录 ZOO-83 的 prompt dirty 修改物理隔离（本 worktree 基于 main，天然隔离；后续合并冲突由总控协调）。

### 4.3 根因 C：归一化统一能力

改动面：`apps/ai-workflows/src/workflows/summary.ts` 的三个正则替换为 `@mewmo/content`（`packages/content/src/html.ts` 已有 HTML→text 能力）；新增真实结构 HTML fixture 测试。

### 4.4 根因 D：数据链修复

改动面：`apps/web` 侧栏 context / API 传参链，按实际断点定。

## 5. 测试与验证设计

- 单测：vitest，按根因落在 `apps/ai-workflows`（summary 归一化/预检查）、`apps/feed-ingestion` + `packages/db`（失效语义）。
- Eval：`apps/ai-workflows/evals/datasets/summary-cases.json` 至少补一条"完整长文（多段落/实体/数字）不得出现'原文信息不足'"用例；`pnpm --filter @mewmo/ai-workflows eval:offline`。
- 校验梯度：目标包 vitest → 目标包 lint + tsc → 需要时根 `pnpm verify`。
- 受控复现记录归档在任务 `research/` 下（脱敏）。

## 6. 回滚与风险

- 全部改动在独立分支，未 merge/push，回滚 = 放弃分支。
- 生产写风险仅一次受控重生成，走产品自身流程，无 schema/数据破坏面。
- 已知风险：Production DB 访问方式待确认（.env.local 生产连接串 / Neon 控制台）；Langfuse 数据保留期可能查不到 7-28 的 trace；目标文章可能有多用户多条记录。
