# ZOO-96 Mac 剪藏与订阅实施计划

1. 扩展既有 `LocalStore` 的 clip/feed/feed-entry 查询为可选 limit/offset，保持旧调用的默认行为。
2. 在 Mac composition root 恢复既有 native session、按账号创建 SwiftData store，复用 SyncEngine、lifecycle coordinator 和 image pipeline。
3. 替换 Shell 的 preview business columns：实现剪藏及 feeds/entries 的本地列表、详情、搜索、筛选、分页、同步/离线/空/错误状态与键盘操作。
4. 删除 clip 时复用 tombstone 和 canonical durable outbox delete mutation；不直接调用新 API。
5. 添加 focused tests，验证 LocalStore 分页、内容 state 的 selection/search/pagination/delete outbox 与 sync state 投影。
6. 运行 focused tests、Apple full verify、diff check；以深浅主题和默认/最小/宽窗口 launch 做视觉验收。
7. 将验证发现追加到 `lesson.md`，精确暂存、提交、推送、创建中文 ready PR，并将 Linear ZOO-96 置为 In Review。

## Rollback

回退 Apple-only commit 即可。SwiftData schema、同步协议、服务端 API、认证凭据和图片磁盘缓存不需要迁移或清理。
