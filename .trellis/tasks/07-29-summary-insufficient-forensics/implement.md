# 执行计划：摘要"原文信息不足"误报取证与根因修复

> 顺序执行；每个 Gate 需向总控（用户）汇报后再继续。SQL 模板见 `research/handover-prompt.md` 第三节。

## Stage 0：现场保全（已完成部分）

- [x] 0.1 `git status --short --branch` 确认主目录 ZOO-83 dirty 现场（5 文件，已确认，不动）
- [x] 0.2 独立 worktree 就绪：`.worktrees/qoder-session-20260729` @ `bef01c1`（= origin/main = 生产 release）
- [x] 0.3 查看截图现场：目标文章确认（来源"AI – 人人都是产品经理"，摘要以"原文信息不足"开头但后续给出大量准确事实）
- [x] 0.4 确认 Production DB 只读访问方式（.env.local 的 Neon 库即生产库，14 真实用户，命中目标文章；Vercel Sensitive 变量无法 pull）
- [x] 0.5 `git show bef01c1:apps/ai-workflows/prompts/article-summary.zh.md` 固化生产 Prompt 证据（v2 规则3 为套话来源，规则4 限 240 字）

## Stage 1：只读生产取证

- [x] 1.1 定位：同一篇文章 3 用户 3 条 entry（目标 `…kb8vt`，另 `…xo6kx` / `…9xwam`），内容完全相同
- [x] 1.2 记录：raw 96760 / 可见 9746 字符；raw_hash 53a26ffd59c6 一致；目标 version=3（read_at 标记所致，非内容变更）
- [x] 1.3 runs：3 条全部 input_version=2、succeeded、idem_key v2；目标与 `…xo6kx` attempts=3、首条 attempts=1
- [x] 1.4 usage：provider primary / gemini-3.5-flash-lite / input_tokens 5647~5650 / output 122~154，无 cache
- [x] 1.5 Langfuse：18:01–18:22 UTC 窗口无 workflow.summary trace（当天仅 16 条 trace，观测覆盖不全）；发现当天 release 切换 3cd8525→d9cfc8d→bef01c1，但 `git diff 3cd8525 bef01c1` 对 summary.ts + Prompt 零差异，不影响判定；后续 production trace 均 environment=production/release=bef01c1
- [x] 1.6 本地重放：norm_hash 0b1bc32a0146 三条一致，归一化后 9746 字符、8/8 关键事实保留、est_tokens 5414 ≈ 实际 5650
- [x] 1.7 D 类核验：run targetId ↔ entry id 一致，DB summary 前缀与截图一致
- [x] 1.8 结论：**根因 B（Prompt false positive）**——同输入 3 次独立生成 2 次误报；A/C/D 均被证据排除。影响面：feed 714 条摘要中 32 条套话开头（10 条正文>2000 字符高疑误报），clips 1/15

**Gate 1：向总控汇报根因判定 + 证据，获准后进入 Stage 2**

## Stage 2：受控复现（一次性）

- [ ] 2.1 存档旧 summary、当前 version、既有 run 清单（脱敏，归档 research/）
- [ ] 2.2 经产品现有 `/api/ai/summary` 或 UI 刷新按钮 enqueue 一次重新生成（不直接改 DB）
- [ ] 2.3 记录新 runId/inputVersion/inputTokens/release/最终 summary；对比五维（误报/事实覆盖/幻觉/完整句/长度）
- [ ] 2.4 如需区分模型随机波动 → 隔离环境脱敏同构输入重复 Eval，不在生产重复写

## Stage 3：根因修复（只做被证实分支；开工前先 trellis-before-dev 读目标包 spec）

- [ ] 3.A stale summary：feed upsert 内容变更检测 + 摘要失效/enqueue 语义 + 非内容变更隔离 + idempotencyKey/inputVersion 绑定真实输入版本
- [ ] 3.B false positive：确定性 sufficiency 预检查（复用 feed-entry-content.ts 能力）+ Prompt 移除主观判断路径
- [ ] 3.C 归一化：summary.ts 三正则 → 复用 @mewmo/content HTML→text + 真实 HTML fixture
- [ ] 3.D 关联错误：UI/API 数据链修复
- [ ] 3.5 按根因补回归测试（真正不足输入不幻觉；完整长文不误报；根因专项用例）
- [ ] 3.6 Eval 数据集补"完整长文"用例并跑 `eval:offline`

## Stage 4：验证（最小范围起步）

- [ ] 4.1 目标包 vitest（ai-workflows / feed-ingestion / db 视改动面）
- [ ] 4.2 目标包 lint + type-check
- [ ] 4.3 必要时根 `pnpm verify`
- [ ] 4.4 对目标文章的受控重新生成最终确认（若修复部署前无法生产验证，改为本地/Eval 证明并注明）

## Stage 5：报告与收尾

- [ ] 5.1 按交接第八节 8 项格式输出最终报告（全部脱敏）
- [ ] 5.2 历史 stale summary 扫描：只给数量估算 SQL + 回填方案，不执行
- [ ] 5.3 代码留在 `qoder/session-20260729` 分支：不 merge、不 push、不动 Linear
- [ ] 5.4 spec 更新（trellis-update-spec，如有可沉淀约定）+ 提交本 worktree 内代码

## 回滚点

- Stage 3 任意步骤失败 → `git checkout .`（仅限本 worktree），生产无残留
- Stage 2 受控复现属产品正常功能路径，无需回滚
