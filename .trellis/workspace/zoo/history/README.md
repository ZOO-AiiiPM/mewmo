# 导入历史

这里保存 Trellis 接入前的项目记忆，避免迁移时丢历史，同时不把旧记录混入 Trellis 自动维护的 `journal-N.md`。

- `legacy-journal/`：原 `journal/` 的只读镜像；原目录继续保留。
- `workbuddy-memory/`：原 `.workbuddy/memory/` 的实体内容；`.workbuddy/memory` 通过软链继续指向这里，兼容 CodeBuddy。

新增 session 记录仍写入上级目录的 `journal-N.md`；本目录只用于按需回查旧历史。
