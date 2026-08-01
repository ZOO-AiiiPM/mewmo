# Journal - zoo (Part 1)

> AI development session journal
> Started: 2026-07-24

---



## Session 1: Trellis P3-P6 接线验收

**Date**: 2026-07-25
**Task**: Trellis P3-P6 接线验收
**Package**: admin
**Branch**: `main`

### Summary

完成旧资产迁移、平台 hook 启用、Linear 状态边界和隔离 smoke task。

### Main Changes

- 旧 specs 作为 1.0 Tauri 历史任务归档，原始材料完整保留。
- 旧 journal 与 CodeBuddy memory 接入 .trellis/workspace/zoo/history。
- Codex hooks 已启用，Claude 双 SessionStart 已去重，五平台入口完成 smoke test。

### Git Commits

(No commits - planning session)

### Testing

- [OK] JSON/TOML 配置解析、hook 脚本执行、OpenCode plugin import。

### Status

[OK] **Completed**

### Next Steps

- 在 Codex TUI 运行 /hooks 并批准本项目 hook；各平台各开一次真实新会话做 UI 级确认。

## Session 2: 死会话考古与 Trellis 同步

**Date**: 2026-07-26
**Task**: 多 session 收敛（无正式 task，产出即规划工件）
**Branch**: `codex/zoo-74-frontend-conversation`

### Summary

对 11 个中断/历史 Claude 会话做全量考古（6 个并行子 agent），把散落在死会话里的未完成工作与关键上下文全部固化进仓库，并同步进 Trellis。

### Main Changes

- 5 份接手简报写入 `.trellis/workspace/zoo/session-briefs/`；`convergence-plan.md` 更新考古结论。
- 新建 6 个 Trellis 任务（planning，未 start）：zoo-70-backend-runtime(P0)、prod-agent-embedding-outage(P0)、security-debt-batch(P1)、branch-worktree-convergence(P1)、feed-fixes-landing(P2)、session-debt-housekeeping(P3)。
- 既有任务 zoo-60/zoo-74/zoo-61 补 research/ 续跑上下文。

### Key Findings

- ZOO-75~78 四条 HIGH issue 实际全部建成（早前以为只有 ZOO-75）；缺第 5 条 CI 门禁 issue。
- ZOO-60 验收 5/7 项通过零 bug，3021+5433 环境仍存活。
- 生产服务器 101.36.117.253 agent/embedding 不可用为头号悬案（7/25 起零进展）。
- 删分支、删 Superpowers skill 的授权均来自已死会话，执行前需重新确认。

### Git Commits

(No commits - 规划/文档工件，未动业务代码)

### Status

[OK] **Completed**（同步部分）

### Next Steps

- 按 P0 先行：ZOO-70 验证推 PR、生产排障；ZOO-60 续跑验收环境仍活着，宜尽快。

## Session 3: ZOO-63 Workflow 全链路验收 + 历史队列回填

**Date**: 2026-07-29
**Task**: 接管 Codex session 019fa7bb 中断的 ZOO-63 生产验收
**Package**: apps/ai-workflows, packages/application
**Branch**: `main`（生产已部署 bef01c1）

### Summary

接手中断于 embedding canary 的 ZOO-63，完成四种 kind canary、异常路径验收、历史队列受控回填、AI Cron 恢复与 empty-queue fast exit、Production 最终回归，并把证据写回 Linear。

### Main Changes

- 异常路径改在 ai-run-service 服务层做确定性验证（retry/exhausted→failed/revive/supersede/claim隔离/lease reclaim 全通过）。
- 历史队列受控分批回填：起始 embedding≈343、summary≈188 + 级联 relation/note_insight，最终 queuedDue=[]、queuedFuture=0、running=0。
- 回填期间 29 个 embedding 因突发高并发打爆 relay 聚合配额报 429/503，revive 后用 concurrency=1 + 批间 sleep 温和重跑全部成功。
- AI Cron 恢复（crontab 每分钟，flock 锁；恢复前备份 /tmp/crontab.zoo63.bak），empty-queue fast exit 实测 claimed:0 快速退出。

### Key Findings

- 生产 AI 调用统一走自建 Vercel relay（内部轮转多个 Gemini key 规避免费层限流）；worker 不直连 Gemini，故坏 key 注入无效，异常验证须走服务层。
- summary 对历史长文超 800 字上限（summary.ts SUMMARY_MAX_CHARACTERS）落 summary_too_long，26 例；按用户决策放行为遗留项，另开 ZOO-83 跟进。
- Langfuse：最近 120 分钟 969 条 production trace（release=bef01c1）覆盖四种 workflow kind，run --rm 瞬时容器正确 flush（fail-open）。

### Git Commits

(No commits - 生产运维/验收，未改业务代码；辅助脚本在 tmp/)

### Linear

- ZOO-63：贴完整验收证据评论，按其规定保持 In Progress 待用户真实验收。
- ZOO-61：补 Workflow 路径 Langfuse 佐证评论，维持 Done。
- ZOO-82：补 Workflow/embedding 经-relay 无 store 400 验证评论；证据不支持重开，维持 Done（待用户确认）。
- ZOO-83：新建 summary_too_long 遗留 issue（Backlog/Medium/关联 ZOO-63）。

### Status

[OK] **Completed**（回填清零 + Cron 恢复 + 回归全绿 + 证据回写；ZOO-63 待用户终验，ZOO-82 重开待用户确认）

### Next Steps

- 用户对 ZOO-82 是否重开做最终决定。
- ZOO-83 择方案修复 summary 长度约束并回填 26 个遗留 summary。

---

## Session 4 — 2026-07-29 · ZOO-63 收口 + ZOO-82/ZOO-83 落定

**Task**: ZOO-63 验收收口（承接 Session 3 悬置项）
**Package**: apps/ai-workflows
**Branch**: `feature/summary-500-char-limit`（未提交 WIP，用户自验中）

### Summary

用户同步两条关键信息，Session 3 遗留的两个 Next Steps 全部落定：ZOO-82 store relay 已修复（维持 Done，不重开）；ZOO-83 summary 长度约束由用户在分支上正式修复。ZOO-63 我方可执行验收部分全部完成，待用户终验标 Done。

### Key Findings

- **ZOO-82 定论**：用户确认 store relay 已修复，与本次生产证据（500+ workflow 经 relay 调用零 store 400、969 条 production trace）一致。交接里“需重开”基于中断时旧假设，现作废——**维持 Done 是正确终态**，阻塞解除。
- **ZOO-83 升级**：从“已授权放行的遗留项”升级为正式修复。用户在 `feature/summary-500-char-limit` 上双侧收敛：`summary.ts` 硬上限 240→800（具名常量 SUMMARY_MAX_CHARACTERS）；`article-summary.zh.md` prompt v2→v4（目标 600–700 字符 / 硬顶 800 / 输出前自检压缩）；配套 summary-judge 提示词 + offline eval 同步。该分支为用户 WIP，本会话未介入提交/PR。

### Linear

- ZOO-63：保持 In Progress，待用户真实终验（按 issue 自身规定，仅用户可标 Done）。
- ZOO-82：维持 Done（用户确认 store relay 已修）。
- ZOO-83：修复进行中（用户分支 WIP，验收后收口）。

### Status

[OK] **我方可执行验收全部完成**；剩余项均为用户侧动作（ZOO-63 终验标 Done、ZOO-83 分支验收）。

### Next Steps

- 用户完成 summary 修复分支验收后，ZOO-83 收口（评论方案 + 标 Done）。
- 用户对 ZOO-63 做最终真实验收并标 Done。


## Session 2: 本地 agent 调试链路打通 + Langfuse 全正文 trace + 代理永久修复

**Date**: 2026-07-30
**Task**: 本地 agent 调试链路打通 + Langfuse 全正文 trace + 代理永久修复
**Package**: admin
**Branch**: `main`

### Summary

1) 确立本地调试 SOP：source .env.local 后 pnpm dev 起 agent(3101)+web(3002)，全程无需云端部署；2) git ff 同步 origin/main 获得 ZOO-61 全量上报，E2E 验证 Langfuse development 环境 trace 含完整 prompt/输出正文（无脱敏），agent 测试 88/88 + lint 通过；3) 根治 Node 22+ fetch 不走代理：新增 apps/agent/src/proxy.ts（EnvHttpProxyAgent，尊重 NO_PROXY），web instrumentation 同步升级，.env.local 补 HTTPS_PROXY/NO_PROXY；4) 澄清 Langfuse 只有 production/development 两个环境，preview 不部署 agent 不产 trace；本地连 preview 库与 Langfuse 环境标签是独立维度。遗留：用户在对话中粘贴过整批密钥建议轮换；3000 端口被旧 next-server 占用。

### Git Commits

| Hash | Message |
|------|---------|
| `9eccb9e` | (see git log) |

### Status

[OK] **Completed**
