# ZOO-96 Mac 剪藏与订阅设计

## Data Flow

`MacContentSession -> AuthSessionController.restore -> LocalDataContainer.account -> LocalStore`

`MacContentStore.load -> LocalStore list methods -> SwiftUI lists/readers`

`SyncEngine / SyncLifecycleCoordinator -> LocalStore -> MacContentStore.reload`

`MewmoRemoteImage -> MewmoImagePipeline.load -> memory/disk/URL cache`

Shell 只负责导航、tabs、主题和焦点；业务页面由一个 MainActor UI state object 直接调用既有 `LocalStore`。它不是新的 repository、sync 或 cache abstraction。

## Composition

- 恢复已存在的 native session 后，以 user id 构造账号隔离的 SwiftData store；没有 session 时显示签入前状态，绝不填充假业务数据。
- `MacContentStore` 立即加载本地分页；初始化和手动刷新后才调用既有 `SyncEngine`。同步诊断和持久化 sync cursor 决定 synced/stale/error 状态。
- Clips 删除先写 `LocalStore.softDeleteClip`，随后用 canonical JSON 入 durable outbox；SyncEngine 的既有 FIFO/CAS/冲突处理负责推送。
- 图片 view 只调用一个 composition-root 持有的 `MewmoImagePipeline`。成功显示 `PlatformImage`，失败保留 SF Symbol 占位；管线自己的磁盘回退决定离线图片是否可显示。
- 所有 selection 使用 id；重载、搜索或删除后，若原 selection 不可见，则选择第一项或清空。

## UI Shape

- `clips`：搜索栏、同步状态、clip cards、分页按钮和 reader；reader 含删除确认、来源链接、抓取错误提示。
- `feeds`：源列表筛选、Feed Entry 搜索/cards、分页按钮和 reader；entry reader 显示来源、未读状态与封面。
- loading/empty/error/signed-out/stale 都由原生 `ContentUnavailableView` 或明确状态行表达，旧数据不会被同步错误覆盖。

## Deferred

登录 UI、账号切换、Feed 管理/抓取、HTML 富阅读器、Entry read/unread mutation、真正无限滚动和后台任务调度均不在本 issue。当前分页以 `FetchDescriptor.fetchLimit/fetchOffset` 实现，达到页尾才增加 offset。
