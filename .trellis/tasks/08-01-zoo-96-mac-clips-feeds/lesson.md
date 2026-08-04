# Lessons: ZOO-96 Mac 剪藏与订阅

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `LocalStore` 已有账号过滤、tombstone、durable outbox 与同步 cursor；本任务只能在其上补分页查询和 UI state，不能旁路 SwiftData。
- `SyncEngine` 已有 launch/manual trigger、诊断与失败分类；UI 读取其输出，不复制网络重试逻辑。
- native auth 目前只有 session restore，没有登录界面；无恢复会话必须显示真实回退状态，而不是 mock 数据。
- 视觉验收不能按应用名或 `pgrep -x` 激活：本机 `/Applications/mewmo.app` 会串台。必须先用唯一 bundle id 构建，再以临时产物绝对 executable 启动和精确 PID 核对。此次 `app.mewmo.zoo96preview` 的裸 binary 可常驻，但当前 GUI session 仅暴露菜单栏 WindowServer records，且没有 Assistive Access，无法得到业务 window 截图；旧版画面不计入验收。
- 复核使用 `DerivedData-ZOO-96-visual/.../Mewmo.app/Contents/MacOS/Mewmo`，构建时覆盖 `PRODUCT_BUNDLE_IDENTIFIER=app.mewmo.zoo96preview`；shell 返回 PID `76141` 且 `ps` 路径匹配。按该 PID 激活后，`NSRunningApplication` 未注册 bundle、CoreGraphics 业务窗口数为 `0`，进程随后自行退出。因此深浅主题和三档窗口的截图仍不可得，不能写成视觉通过。
