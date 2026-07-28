# Trellis P6 最小验收

## Goal

验证 Plan→Execute→Finish 状态机、hook 上下文与 journal 写入。

## Requirements

- 任务创建后保持 `planning`，经 `task.py start` 进入 `in_progress`。
- 五个平台的 Trellis hook / plugin 入口可加载，注册路径存在。
- `add_session.py --no-commit` 能把本次验收记录写入 zoo workspace journal。
- `task.py finish` 能清除隔离 session 指针，`task.py archive --no-commit` 能将任务归档为 `completed`。
- 不改变其他 Codex session 的 current task，也不自动提交工作区改动。

## Acceptance Criteria

- [ ] 隔离 context `codex-p6-smoke` 完成 Plan → Execute → Finish。
- [ ] 归档任务位于 `.trellis/tasks/archive/2026-07/` 且 `status=completed`。
- [ ] journal/index 已出现本次 P6 验收记录。
- [ ] 原 Codex session 的 PR #28 current task 指针仍存在。

## Notes

- 这是一次轻量配置 smoke test，PRD-only 即可。
