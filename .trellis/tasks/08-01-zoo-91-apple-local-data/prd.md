# ZOO-91 Apple SwiftData 本地数据层

## Goal

建立三端共享、按账号隔离的 SwiftData 本地数据层，使内容可在无网络首屏读取，并为后续 SyncEngine 提供稳定的实体、cursor 和 outbox 原语。

## Confirmed Facts

- 工程目标为 macOS 14+/iOS 17+、Swift 6，Mac/iPhone/iPad 共享 `apps/apple/Sources/`。
- 服务端真相源是 PostgreSQL；Apple 本地层是 cache/outbox，不重定义同步协议。
- 同步实体为 note、clip、feed、feed_entry；公共字段为 id、version、createdAt、updatedAt、deletedAt、userId。
- ZOO-89 cursor 是 opaque composite string，本地只持久化，不解析或重建。
- 当前 Apple 工程没有 test target；本 Issue 负责建立后续 Apple 基础模块复用的共享 macOS unit-test gate。

## Requirements

1. 使用 `VersionedSchema` 定义 V1：四类本地实体、每用户 `LocalSyncState` 和 durable `PendingMutation`。
2. 生产容器按账号使用独立 store URL；repository 查询仍必须显式校验 userId。
3. repository 通过 actor/`@ModelActor` 隔离 `ModelContext`，跨 actor 只返回 Sendable value snapshots，不泄漏 `@Model` 对象。
4. 提供四实体查询、upsert、tombstone 和显式读取；默认列表过滤 deletedAt。
5. 远端 upsert 不允许旧 version 覆盖新 version；同 id/version 重放必须幂等。
6. `LocalSyncState` 原样保存 contractVersion 和 cursor；`PendingMutation` 保存稳定 mutation id、entity/op、expectedVersion、原始 JSON payload 与 FIFO 顺序。
7. 直接消费 `packages/sync/src/fixtures/` 的 pull fixtures，不复制第二份 fixture；未知 JSON 字段兼容，毫秒 ISO-8601 明确测试。
8. 图片只保存来源 URL，不把二进制写入 SwiftData；FeedEntry 与 Feed 首版使用标量 id，不建立 cascade relationship。
9. 建立共享 Apple unit-test target 与 `make test`/`make verify` 门禁，供后续 ZOO-92/93 追加测试而无需再次设计测试基座。
10. store 打开失败必须向上传错，禁止静默删除或重建用户数据。

## Acceptance Criteria

- [ ] V1 内存 container 可创建，临时磁盘 container 关闭/重开后数据、cursor 与 outbox 不丢失。
- [ ] 四实体 CRUD/upsert、版本单调性、幂等重放和稳定排序均有测试。
- [ ] user A 的实体、cursor、outbox 无法被 user B 查询或修改。
- [ ] tombstone 默认不可见但可显式读取，记录及 version 被保留。
- [ ] pull incremental/pagination/tombstone fixtures 可 decode 并落库，不复制 fixtures。
- [ ] outbox FIFO、ack 精确删除和重开持久性有测试；不实现网络 push/retry/conflict loop。
- [ ] production container 实际引用 V1 schema 与 migration plan。
- [ ] `make -C apps/apple test` 与 `make -C apps/apple verify` 均通过。
- [ ] 根同步 contract tests 继续通过，SwiftData 模型不依赖 SwiftUI。

## Out of Scope

- URLSession、认证、Keychain 和 SyncEngine 调度。
- 图片二进制缓存、图片下载和 URL 改写。
- 网络 conflict resolution、push/retry 策略和后台任务。
- 业务 UI、编辑器和 AI。
- 虚构 V2 migration；本 Issue 只建立真实 V1 migration 入口与 reopen 验证。
