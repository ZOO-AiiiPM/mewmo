# Legacy 历史记忆镜像（P3 增量步）

> 本目录是 mewmo 迁 Trellis 前的历史开发记忆**只读镜像**，供任意平台 agent 冷启动回溯"上次做到哪"。
> 由交接流程增量拷入，**不参与** Trellis 自己的 `journal-N.md` 编号与 `index.md` 自动块。

## 内容
- `journal/` ← 镜像自仓库根 `journal/`（事故复盘 / 优化笔记 / iOS setup 等，含 `_archive-2026-06-01-single-file.md`）。
- `workbuddy-memory/` ← 镜像自 `.workbuddy/memory/`（`MEMORY.md` + 日志 + `ZOO-49_完成评论.md`）。

## live 真源（仍以这些为准，本目录只作快照）
- 开发日志 live 源：仓库根 `journal/`。
- CodeBuddy 记忆 live 源：`.workbuddy/memory/`（CodeBuddy 读此路径，**勿删勿改结构**）。
- Trellis 会话 journal：同级 `../journal-1.md`（由 `add_session.py` 追加）。

## 待 Codex 收尾（P3 剩余）
- 决定 `.workbuddy/memory/` 是否改为软链回指（计划建议保留软链，避免 CodeBuddy 断记忆）——需用户确认后再动。
- 新历史应写进 Trellis `journal-N.md`；本镜像仅保留存量，不再增量同步。
