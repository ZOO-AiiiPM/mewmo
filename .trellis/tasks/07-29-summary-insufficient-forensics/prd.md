# 生产摘要"原文信息不足"误报取证调查与根因修复

> 需求真相源：`research/handover-prompt.md`（总控交接 prompt 原文）。本 PRD 为其结构化摘录。

## Goal

从 Production 证据出发，查明并修复：一篇正文完整的订阅文章（"上线3个月、1200万DAU，WorkBuddy是怎么炼成的？"），智能总结却以"原文信息不足，只说明能够确认的内容"开头。修复必须消除产生错误判断的机制，而不是隐藏这句话。

## Requirements

### 调查（先于任何修复）

- R1 取证优先：先证明模型当时实际收到了什么输入，区分四类根因（A 旧摘要对应旧正文 / B Prompt false positive / C HTML 归一化破坏输入 / D 目标关联错误），证据不足时停止并报告，不得猜测。
- R2 只读生产调查：定位目标 `feed_entries` 记录 → 查其全部 summary `ai_runs` → 查对应 `ai_usage_events` → 用 langfuse skill 核对 trace（environment/release/tokens/重试）。根因确认前 Production DB 只允许 SELECT。
- R3 受控复现：只对目标文章通过产品现有流程（`/api/ai/summary` 或 UI 刷新）执行一次重新生成，记录前后对比；不得连续重复写生产，模型波动改用隔离环境 Eval。

### 修复（按证据确认的根因执行，方向见 design.md）

- R4 根因 A → 修复正文更新与摘要失效/重跑语义（仅摘要输入真正变化时失效并 enqueue；readAt 等非内容变化不触发；idempotencyKey/inputVersion 对应真实输入版本）。
- R5 根因 B → source sufficiency 变为确定性应用逻辑（可测试预检查 + Prompt 移除主观判断路径），禁止输出后处理补丁，禁止 WorkBuddy 专用规则。
- R6 根因 C → 修复正文转纯文本统一能力，优先复用 `@mewmo/content`，增加真实结构 HTML fixture。
- R7 根因 D → 沿 UI context/API 数据链修复 ID 关联。

## Constraints（硬约束）

- C1 不得先改 Prompt、删套话或输出后处理来掩盖问题。
- C2 主目录 `feature/summary-500-char-limit` 的 5 项 dirty 文件（ZOO-83 现场）绝对不动：不修改/stash/reset/清理；本任务代码在基于最新 `origin/main` 的独立 worktree（已建：`.worktrees/qoder-session-20260729`，分支 `qoder/session-20260729`）。
- C3 不重开/关闭/修改 ZOO-63（已 Done）；Linear 评论草稿先交总控。ZOO-83（summary_too_long）不属于本任务。
- C4 保密：不输出 DATABASE_URL、API Key、用户完整正文、完整 userId；报告全部脱敏（只记录长度、hash、前缀、时间线等）。
- C5 不直接用 SQL 改 summary，不为单篇文章人工覆盖结果，不删除生产数据、不清理旧 run。
- C6 代码完成后不 merge、不 push、不改 Linear 状态；留在独立分支等总控验证。
- C7 不修复无关测试、不顺手重构。历史 summary 批量扫描/回填只给数量和方案，不自行执行。
- C8 Production release 基准 `bef01c1`；须核实目标 run 的实际 release，不以当前 dirty 文件推断生产行为。

## Acceptance Criteria

- [ ] AC1 根因明确归入 A/B/C/D（或复合），每条结论有生产证据支撑（version、inputVersion、inputTokens、时间线、release，均脱敏）。
- [ ] AC2 完成受控重新生成并记录前后对比（是否仍误报/事实覆盖/幻觉/完整句/长度）。
- [ ] AC3 修复代码消除误判机制本身（对照 R4–R7 相应项），无掩盖式补丁。
- [ ] AC4 回归测试补齐（与实际根因相符）：真正不足输入不幻觉；完整长文不误报"原文信息不足"；根因相关的失效/归一化用例。Eval 数据集补"完整长文"用例（现仅有 insufficient 用例：`apps/ai-workflows/evals/datasets/summary-cases.json`）。
- [ ] AC5 单测、Eval、lint/type-check 实际通过，验证从最小范围开始。
- [ ] AC6 输出符合交接第八节格式的最终报告（8 项，含未验证风险与批量回填建议）。
- [ ] AC7 全程未违反 C1–C8 任何一条。

## Notes

- 若无法访问 Production 或无法唯一定位目标记录：明确阻塞点，返回本地代码链分析 + 下一步只读查询，不编造生产结论。
- 目标记录定位辅助线索：截图时间"7 月 28 日 19:08"、来源、URL、发布时间。
