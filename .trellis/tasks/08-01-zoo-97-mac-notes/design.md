# ZOO-97 设计

## 方案

`MacNotesWorkspace` 取代 notes section 的 preview 内容，但保持 ZOO-94 Shell、tab 和 token。它持有一个小型 `MacNotesViewModel`（UI state，不是新的 data/sync layer）：读取 `LocalStore` snapshots，所有写操作调用 `MacNoteMutations`，后者只完成本地 upsert / tombstone + canonical outbox 入队。随后由 UI task 调用已有 `SyncEngine`；网络失败保留本地状态。

## 数据流

`SwiftUI event -> MacNotesViewModel -> MacNoteMutations -> LocalStore (snapshot + outbox) -> SyncEngine`

`SyncEngine pull -> LocalStore -> MacNotesViewModel reload`

本地 version 在尚未 server ack 的 mutation 前保持当前值；create 使用 `version = 0`、update/delete 使用已知 server version。mutation payload 采用现有 v1 `{ entity: "note", op, id?, data, clientMutationId }`，不加 Apple 专属 wrapper。

## 冲突边界

现有 SyncEngine 对 `version_conflict` 会保存 remote record 并 ack 陈旧 mutation。为避免看不见的内容丢失，view model 在同步前从 durable outbox 和本地 snapshot 读取待推送内容；同步后若服务端版本覆盖了这些字段，就将该候选内容持久化到按 account scope 的 `UserDefaults`，并显示「保留本地副本 / 使用远端」选择。前者新建本地副本并入队，后者清除冲突记录。不会尝试字符级自动合并。

## Markdown 与图片

编辑区是原生 `TextEditor`，存储和复制均为 Markdown 文本。它不解析/重写 Web Milkdown 的 rich-text 结构；图片 Markdown 原样保留，阅读预览仅通过 `MewmoImagePipeline` 加载 `![](...)` 的原 URL。上传仍属于服务端/API 边界，明确不在本 Issue。

## 验证

XCTest 覆盖 mutation JSON、outbox、重开、冲突决策、搜索/筛选；完整 Apple verify 证明三 target 仍构建。浏览器无法承载原生 Mac App，视觉验收以运行 macOS app 截屏核对 ZOO-90 主题与窗口档位。
