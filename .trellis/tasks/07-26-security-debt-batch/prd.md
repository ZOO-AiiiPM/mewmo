# 安全债修复批次：ZOO-75/76/77/78 + CI 门禁 issue 补建

## Goal

完成 2026-07-26 全仓架构 review 留下的 5 项待还债：修复 4 个已建 HIGH issue（ZOO-75/76/77/78），并补建+推进第 5 条「集成测试进 CI 门禁」。

## Background

完整上下文见 `.trellis/workspace/zoo/session-briefs/arch-review-line.md`（含每条 issue 的修复要点、并发冲突面分析、4 份子 agent 报告的路径）。要点：

- ZOO-75（image-proxy 无鉴权）/ ZOO-77（feed 游标丢文章）/ ZOO-78（登录零限速）三项与在飞分支文件面无交集，**可各开 worktree 基于 origin/main 并发做小 PR**。
- ZOO-76（JWT 改密不失效）动 User 表 schema + Prisma migration，**必须排队**（与 ZOO-70 的 migration 协调线性顺序）。
- 第 5 条 issue 未建成（旧会话被模型风控拦死）：标题建议「claude: 集成测试进 CI 门禁 + apps/web test 脚本空壳」，要点在简报里。⚠️ 措辞用工程语言（测试门禁覆盖），避免攻击性安全词汇触发风控。

## Requirements

- 先 `git fetch` 核对 4 条 issue 描述中的 file:line 在当前 origin/main 是否仍准确（review 跑在落后分支上）。
- 每个修复独立分支独立 PR，命名沿用 `codex/zoo-NN-*` 惯例。
- 修复必须带测试（issue 内已注明测试方向）。

## Acceptance Criteria

- [ ] 第 5 条 Linear issue 已创建
- [ ] ZOO-75 修复 PR（auth + 私网拦截复用 + 测试）
- [ ] ZOO-77 修复 PR（partial 不推进游标 + 退避修复 + 测试）
- [ ] ZOO-78 修复 PR（失败计数限速 + dummy bcrypt + zod + 测试）
- [ ] ZOO-76 修复 PR（migration 排队合入）
- [ ] CI 门禁 PR（CI 跑 `pnpm verify`，集成测试进门禁）

## Notes

- 建议作为 parent task，每条债一个 child task 独立验收（`task.py create --parent`）。
