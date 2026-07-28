# 分支与 worktree 收敛执行（安全检查+落袋+删枝+prune）

## Goal

完成 a2d39f0f 会话已获用户授权（「全部执行·推荐档」）但被 API 故障打断的仓库收敛：前置安全检查 → 落袋残余 → 删冗余分支 → 遗留分支打 tag 后删 → `git worktree prune`。

## Background

完整清单与状态见 `.trellis/workspace/zoo/session-briefs/convergence-execution.md`。⚠️ 原授权发生在已死会话——**执行删除类步骤前须向用户重新确认一次**。

## Requirements（按序执行）

1. **前置安全检查**：`ps` 确认无 codex/qoder 进程存活；审查 `.gitignore` diff；**扫描未跟踪的 `deploy/vercel-env-update.sh` 是否含硬编码密钥**（入库前必查）。
2. **落袋残余**：`worktree/agent-summary-sidebar` 28 脏文件打 WIP；`.worktrees/zoo-63-production-release` 8 脏文件打 WIP（packages/ai/runtime，与 PR #32 重写区域重叠，后续挑拣）；决定主 worktree 未跟踪文件去留；`.worktrees/qoder-workspace` 琐碎改动处置。
3. **删冗余分支**（已验证并入 main 无差异，删前先 `git worktree remove` 对应 worktree）：`codex/zoo-60-misc`、`codex/zoo-62-migration-history`、`codex/zoo-64-pgvector-hybrid-retrieval`、`codex/zoo-65-jina-web-tools`、`codex/zoo-63-google-env-hotfix`、`codex/zoo-63-local-ai-acceptance`、`codex/langfuse-tracing`、`qoder-no-cn`。⚠️ `codex/workspace`（带 d205a47）和 `codex/zoo-63-production-release-acceptance`（有脏文件）**已从可删清单移除**。
4. **遗留分支打 `archive/<name>` tag 后删**：`codex/video-frontend`、`codex/agent-summary-sidebar`（落袋后）、`feature/ios`；`integration/ai-retrieval-tools` 与 `codex/zoo-60-ai-runtime-deployment` 先甄别互差 87 文件是否只是旧版本。
5. `git worktree prune` 清 3 个 /private/tmp 条目。

## 环境注意

- 别杀 PID 12558（3021 端口，ZOO-60 验收环境）；PID 94723（3101 agent server）可复用或征询后清。

## Acceptance Criteria

- [ ] 安全检查三项完成且结论记录（密钥扫描结果必须留档）
- [ ] 所有 worktree 工作区干净（脏文件全部落袋或明确放弃）
- [ ] 冗余分支删除、遗留分支 tag+删、prune 完成，`git worktree list` 与 `git branch` 输出留档
- [ ] 破坏性步骤执行前有用户本轮确认记录
