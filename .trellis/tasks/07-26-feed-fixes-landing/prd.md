# Feed 修复落地（WIP d205a47）：确认 Issue、rebase、开 PR

## Goal

把抢救性 WIP 提交 `d205a47`（wip(feed): preserve staged feed ingestion fixes，12 文件 +272/-5）确认归属、更新基线并推成可验收的 PR。

## Background

- 工作现场：worktree `.worktrees/codex-workspace`，分支 `codex/workspace`，落后 origin/main 2 个提交，工作区干净。
- 该提交内容集中在 feed ingestion，但**对应哪个 Linear Issue 未确认**——注意与 ZOO-77（feed 条目失败后游标照常前移、文章静默丢失，Backlog/High）高度疑似同一主题，接手第一步就是对照 `d205a47` diff 与 ZOO-77 描述判断是否同一件事，避免重复修。
- ⚠️ 早前收敛分析曾把 `codex/workspace` 列为「按祖先关系已合并、可安全删」——那是 WIP 提交之前的结论，现已失效，该分支不可删。

## Requirements

- 确认 `d205a47` 与 Linear issue 的对应关系（首选核对 ZOO-77）；无对应则建 issue 或并入 ZOO-77。
- rebase 到 origin/main（仅落后 2 提交，预期低冲突）。
- 补齐测试与验证后开 PR。

## Acceptance Criteria

- [ ] Issue 归属结论明确并记录
- [ ] rebase 完成、build/test 全绿
- [ ] PR 创建（推送前需用户确认），或判定并入 ZOO-77 修复分支
