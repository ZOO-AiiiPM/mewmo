# Lessons: Mew 对话交互修复与编排实验

本文件记录任务执行中观察到的原始经验。它们尚未自动成为项目规范；后续整理 agent 应核对证据，再将长期有效的内容沉淀到 `.trellis/spec/`。

## Agent 角色分配

- AO UI 正确展示了实际角色；问题来自主控将 Codex 错误分配为 worker，而不是预定的 OpenCode DeepSeek。
- 后续需要在 spawn 前由主控核对执行 agent 与 model，不能把角色分配错误归因于 UI。

## 权限与 Approve 状态

- worker 创建时没有获得所需权限，后续修改权限不会注入已经运行的会话；需要新的 runtime session 才能获得权限。
- 新 runtime session 应继续复用原 Linear Issue、Trellis task、worktree、branch 和 PR，不扩张顶层执行单元。
- 旧会话会长期停留在 `approve`，没有自动转为其他可解释状态。AO 后续需要核查 approval 状态的 reconcile 与超时恢复机制。

## 状态与监控

- 持续监控会消耗不必要的 token；主控只需在进入 `In Review`、出现阻塞或需要用户授权时介入。
- worker 完成、PR 创建、CI 结果与 Linear 状态之间需要可靠的事件驱动同步，避免执行已结束但状态仍停留在旧阶段。

## 命名与绑定

- Branch 必须包含 `issue-<Linear ID>`，否则现有自动化无法识别任务绑定。
- 顶层 Linear Issue 与 Trellis task、AO 执行单元、worktree、branch、PR 保持 1:1；验收发现形成的 subissue 继续复用这些执行资源。
