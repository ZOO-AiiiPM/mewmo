# mewmo 多 session 收敛计划（2026-07-26）

> 给任何新 session 的交接文档。旧 session 无法恢复也不需要恢复：所有工作成果已固化在 git，
> 按本文档 + 对应 worktree 的 git 状态即可继续任何一条线。

## 真实主线

- **正式代码 = `origin/main` @ `b3cb97f`**，已含 PR #27（PGVector/Jina/Gemini/Web 工具）、#29（Google Provider 修复）、#30（migration history）、#32（Provider 报错终止 Agent turn）。
- 本地 `main` 曾停在 `895c3cc`（落后 5 个提交）——**不要用本地 main 判断正式代码**，先 fast-forward。
- GitHub 唯一 open PR：#28 国际化（`qoder/workspace` 分支，落后 main，需解冲突）。

## 已保护的在建工作（4 个本地 WIP 提交，均未推送）

| 线 | 提交 | 位置 | 状态 |
|---|---|---|---|
| ZOO-74 前端对话 | `afe9470` | 根目录 `codex/zoo-74-frontend-conversation` | 27 文件，基于旧 main `895c3cc`，**需 rebase 到 b3cb97f**（预期与 #27/#32 的 agent 改动冲突） |
| ZOO-70 后端 Runtime | `246e102` | `.worktrees/zoo-63-agent-session-fixes`（分支 `codex/zoo-70-backend-runtime`） | 21 文件，基于最新 main，工作区干净，**最接近可验收** |
| ZOO-61 Langfuse | `61dcbde` | `.worktrees/zoo-61-langfuse-observability` | 15 文件，基于最新 main，工作区干净；缺 PR + 真实 key smoke |
| Feed 修复 | `d205a47` | `.worktrees/codex-workspace`（分支 `codex/workspace`) | 12 文件，落后 main 2 个提交；**对应 Issue 未确认** |

## 待挑拣（不可直接合，也不可直接删）

- `.worktrees/zoo-63-production-release`：8 个脏文件全在 `packages/ai/src/runtime/`，该区域已被 PR #32 重写。对照新 main 逐文件挑有价值改动，其余放弃。
- `worktree/agent-summary-sidebar`：28 脏 + 7 未跟踪（summary-worker、prompts、summarize 测试），落后 189 提交，与 ZOO-74 sidebar 高度重叠。先给它打 WIP 提交保护，再挑拣。

## 可归档 / 清理

ZOO-64、ZOO-65（已进 #27）；ZOO-63 local acceptance（#32 已合）；ZOO-60 misc（#20）、ZOO-60 deployment（#17 关闭）；`langfuse-tracing`（被 ZOO-61 worktree 替代）；`video-frontend`（PR #1 关闭）；`qoder-no-cn`（无实际改动）；3 个 `/private/tmp` prunable worktree（`git worktree prune` 即可）。归档前可打 `archive/<name>` tag 保底。

## 收敛顺序（每步可由独立 session 完成）

1. **main 同步**：`git checkout main && git merge --ff-only origin/main`（或直接 `git fetch` 后以 origin/main 为基准，不切换）。
2. **给 summary-sidebar 和 production-release 打 WIP 提交**（纯保护，无风险）。
3. **ZOO-70**：在其 worktree 跑 build + test，通过后推分支、开 PR。
4. **ZOO-61**：同上；PR 后补真实 key smoke。
5. **ZOO-74**：rebase `afe9470` 到 `b3cb97f`，人工解冲突（重点：agent 路由/API、globals.css）。
6. **PR #28**：merge main 解冲突后单独验收。
7. **Feed 修复**:先确认对应 Issue，再 rebase（仅落后 2 提交）。
8. **挑拣**两个旧 worktree → 9. **清理归档**。

## 会话考古结果（2026-07-26 傍晚补录）

对 11 个中断/历史会话做了全量考古，接手简报存于 `session-briefs/`：

- **arch-review-line.md**：架构 review 总评 3.5/5；ZOO-75/76/77/78 四条 HIGH issue 已建成（早前以为只有 ZOO-75），缺第 5 条「CI 门禁」；并发修复方案已定（75/77/78 并行、76 排队）。
- **zoo60-acceptance-resume.md**：ZOO-60 验收 5/7 项通过零 bug，3021+5433 环境仍存活可续跑。
- **convergence-execution.md**：用户曾授权「全部执行」收敛但只完成落袋；安全检查/删分支/tag/prune 全部未做；含本地 agent 运行姿势、Clash×Neon 断连根因、ZOO-63 诊断（ZOO-70 是关键路径最上游、ZOO-61 需重新生成 Langfuse key）。
- **shell-frame-css.md**：7/10 画框 UI 改造已在 main（藏在 perf 提交 8e04277）；设计决策已抢救；与 summary-sidebar 脏文件无关但将来合并会冲突。
- **small-sessions-verdicts.md**：4 个会话可归档；2 件遗留实事——Superpowers skill 清理（已批未执行）、**生产服务器 agent/embedding 不可用（最重要悬案）**；另需核对 3 个拟好的 AI 层 issue 是否已录 Linear。

**Trellis 同步完成**：新建 6 个任务（均 planning 状态，未 start）——`07-26-zoo-70-backend-runtime`(P0)、`07-26-prod-agent-embedding-outage`(P0)、`07-26-security-debt-batch`(P1)、`07-26-branch-worktree-convergence`(P1)、`07-26-feed-fixes-landing`(P2)、`07-26-session-debt-housekeeping`(P3)；已有任务 zoo-60/zoo-74/zoo-61 的 research/ 目录已补续跑上下文。**除 bootstrap 外，所有已知在建/待办工作现在都有对应 Trellis 任务。**

## 收敛执行结果（2026-07-26 晚，用户授权后执行）

- **本地 `main` 已 fast-forward 到 `b3cb97f`**。
- **安全检查通过**：无并行 agent 进程；`vercel-env-update.sh` 无硬编码密钥（运行时读 .env.local）；`.gitignore` 新增 `**/.env.local.bak*` 防 env 备份误提交。
- **落袋**：summary-sidebar → `997e706`；production-release → `c1f0ea7`；qoder-workspace 生成文件噪音已还原。
- **删除 8 个冗余分支**（逐一用 merge-tree 复核树一致后删）：zoo-60-misc、zoo-62-migration-history、zoo-64-pgvector、zoo-65-jina-web-tools、zoo-63-google-env-hotfix、zoo-63-local-ai-acceptance、langfuse-tracing、qoder-no-cn，对应 worktree 已移除。
- **5 个遗留分支打 `archive/*` tag 后删**（tag 仅本地未推送）：video-frontend、feature-ios、agent-summary-sidebar（挑拣时从 tag 取）、integration-ai-retrieval-tools、zoo-60-ai-runtime-deployment。
- 3101 旧 agent server 已自行退出，无需处理。
- 剩余 worktree 15 个，全部有主：根目录（ZOO-74）+ 6 个 claude/* 子 session 副本 + main-audit（ZOO-60 验收环境）+ codex-workspace（feed）+ qoder-workspace（PR28）+ zoo-61/zoo-70/production-release/zoo-75/zoo-78。
- 残留：`.worktrees/zoo-19-move-dialog-persist`、`.worktrees/zoo-27-note-copy`、`worktree/qoder` 是纯构建缓存残渣（无源码），分类器拦截了 rm，待用户手动删。

## 给新 session 的启动模板

> 打开 worktree `<路径>`（分支 `<分支名>`），这是 mewmo 收敛计划的第 N 步。
> 真实主线是 origin/main@b3cb97f。任务：<目标>。验收：<标准>。
> 背景见 `.trellis/workspace/zoo/convergence-plan.md`。不要动其他 worktree。
