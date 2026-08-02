# ZOO-97 实施计划

1. 增加 notes mutation helper：本地写入、canonical outbox、持久化冲突副本和对应 focused tests。
2. 以现有 `MacShellView` 为宿主接入 notes workspace；其他 Shell preview section 保持不变。
3. 加入列表/搜索/筛选/编辑/删除/状态和原生键盘命令；图片只读取既有 Nuke pipeline。
4. 执行 focused tests、`make -C apps/apple verify`、`git diff --check`；运行 Mac app 做深浅和三档窗口视觉验收。
5. 追加 lesson，按文件 stage，提交、push、开中文 ready PR；完成后将 Linear 置 In Review，不 approve/merge/deploy。

## Review Gates

- 没有新 HTTP/sync protocol 或 Markdown editor abstraction。
- 本地保存先于 network；失败、离线和冲突状态可见。
- 不修改 server、schema、shared 或 iOS/iPad UI。
