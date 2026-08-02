# ZOO-96 Mac 剪藏与订阅

## Goal

在 macOS 三栏 Shell 内交付剪藏、订阅源与 Feed Entry 的本地优先浏览：先显示已有 SwiftData 数据，再由现有同步引擎后台更新。

## Requirements

- 剪藏列表/详情支持搜索、分页、选择、软删除和删除后稳定选择下一项或空态。
- 订阅源和 Feed Entry 支持列表/详情、源筛选、搜索、分页、未读与同步/离线状态。
- 已恢复的原生会话按账号打开既有 `LocalStore`；本地读取不能等待网络。无会话、存储错误、同步失败和空数据必须各有明确状态。
- 图片使用 ZOO-92 `MewmoImagePipeline` 的原始 URL 加载与离线缓存回退，不写 SwiftData 图片数据、不建第二个图片缓存。
- 同步只复用既有 `SyncEngine`、`SyncLifecycleCoordinator` 和 durable outbox。剪藏删除以现有 tombstone + canonical clip delete mutation 表达。
- 保留 Shell 的原生三栏、tab、主题和键盘基础；新增列表搜索焦点、刷新、删除、加载更多与 Escape 取消删除确认的键盘操作。
- 深浅主题、主要窗口尺寸、VoiceOver 标签、reduced-motion 与 iOS/iPad 占位入口保持可用。

## Boundaries

- 仅限 `apps/apple` 和本 task artifacts；不改浏览器扩展、Feed 抓取服务、AI、Web/服务端 API、Prisma schema、`packages/shared` 或 iOS/iPad 完整 UI。
- 不实现登录表单、订阅源新增/编辑、抓取触发、剪藏采集、Feed Entry 收藏或完整离线写入策略。
- 不新建同步、缓存、HTML 清洗或网络 wrapper；认证、存储、同步和图片的既有实现是边界真相源。

## Acceptance Criteria

- [ ] 已恢复会话时，Mac 先从账号隔离的 `LocalStore` 显示 clips/feeds/entries；网络同步在后台，不阻塞首屏。
- [ ] Clips 支持搜索、分页、详情、图片、软删除与 durable delete mutation；Feeds/entries 支持源筛选、搜索、分页和详情。
- [ ] 无会话、空、存储错误、同步失败与 stale/offline 内容均有稳定、可读的回退状态。
- [ ] 深浅主题和主要窗口宽度下三栏无重叠/截断，键盘命令与基本辅助功能可用。
- [ ] Focused tests、`make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check` 均通过。
