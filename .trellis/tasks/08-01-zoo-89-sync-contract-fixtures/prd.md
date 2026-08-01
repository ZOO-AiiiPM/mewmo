# ZOO-89: versioned cross-platform sync contract and fixtures

## Goal

固化（harden）现有 sync pull/push 从 Web 实现细节为 Apple 可复用的**版本化 contract** 与**平台中立 JSON fixtures**。核心是把 `@mewmo/sync` 从「孤儿、与 shared 重复且不一致的协议副本」提升为「唯一权威的版本化协议定义 + 校验 + fixtures」，并让 Web 端 pull/push 严格遵循该 contract。

## Context / 已审计现状

- 现有同步实体 `note / clip / feed / feed_entry`，操作 `create / update / delete / mark_read / mark_unread`。
- Pull：`POST /api/sync/pull`，提交 ISO 时间游标 → 服务端按 `updatedAt > cursor` 返回 4 类 records，返回新的 ISO 游标。无分页。
- Push：`POST /api/sync/push`，提交 mutations[]。note/clip 支持 create/update/delete，feed_entry 只支持 mark_read/mark_unread。update 有 `expectedVersion` 字段（schema 层）但**路由未实现乐观并发校验**。
- `@mewmo/shared` 定义了 `SyncEntity/SyncOperation/SyncMutation/SyncRecord/SyncPullResponse`（`nextCursor` 字段）。
- `@mewmo/sync` 定义了一套**几乎相同但字段不一致**的协议（`cursor` 字段 + `normalizeCursor/createEmptyRecords`），且**未被任何代码消费**（孤儿包）。
- Web pull 路由自带一个 `normalizeCursor` 副本，与 `@mewmo/sync` 的重复。
- `SyncCursor` 模型存在但未使用（pull 用客户端 ISO 时间游标）。
- 核心可同步数据有 `id / version / updatedAt / deletedAt`（软删除 tombstone）。

## Requirements

1. 审计并统一 note/clip/feed/feed_entry 的 pull/push DTO，消除 `@mewmo/sync` 与 `@mewmo/shared` 的双协议分歧。
2. 在 `@mewmo/sync` 定义**版本化 contract**：`SYNC_CONTRACT_VERSION` + 兼容策略（向后兼容、未知字段忽略、必填校验）。
3. 明确并文档化以下语义：
   - **cursor**：增量拉取游标（兼容现有 ISO 时间游标的演进方向，同时支持分页游标）。
   - **tombstone**：软删除 + `deletedAt`，pull 需携带已删除记录使客户端下沉。
   - **version**：每实体乐观版本号，服务端递增。
   - **idempotency**：幂等。create 可接受客户端 `id`，重复 push 同一 id 不重复创建；`clientMutationId` 用于去重。
   - **conflict**：update/delete 基于 `expectedVersion` 的乐观并发；版本不匹配返回冲突，不静默覆盖。
   - **pagination**：pull 支持 `limit` + 分页。
   - **compatibility**：contract 版本化与演进策略。
4. 产出**平台中立 JSON fixtures**（cover 增量拉取、创建/更新/删除、重复 push、版本冲突），存放在 `@mewmo/sync` 内，供 Swift 端直接消费（不依赖 TS runtime）。
5. **Web 端 contract tests 全绿**：fixtures 驱动的协议校验测试。

## Out of Scope（禁止实现）

- SwiftData 本地缓存。
- Apple 网络客户端（URLSession）。
- SyncEngine / 后台同步调度。
- 业务产品 UI。
- 引入 IndexedDB / 离线队列 / WebSocket 通知 / 完整冲突解决（version vector / LWW）。

## Acceptance Criteria

- [ ] `@mewmo/sync` 成为唯一权威、带 `SYNC_CONTRACT_VERSION` 的协议定义；`@mewmo/shared` 复用该定义（不再维护第二套协议类型）。
- [ ] `prd`/`design`/`implement` 明确 cursor、tombstone、version、幂等、冲突、分页、兼容语义。
- [ ] 平台中立 JSON fixtures 覆盖：增量拉取、创建/更新/删除、重复 push（幂等）、版本冲突（乐观并发）。
- [ ] Web 端 pull/push 行为与 contract 一致：`expectedVersion` 冲突被拒、create 幂等、pull 分页有效；契约测试全绿。
- [ ] Swift 端可直接消费 fixtures，不依赖 TypeScript runtime（fixtures 是纯 JSON，schema 是 TS 定义但 fixtures 独立）。
- [ ] `pnpm lint`、`pnpm test:unit`、`pnpm build`、`pnpm test:theme` 全绿（repo CI gate）。

## Notes

- 本任务只修「协议层缺口」，不引入大规模 Schema/迁移（`SyncCursor` 表已存在，但不强制改造 pull 走 version cursor——除非契约需要；改动以「不改 DB schema、不迁移」为优先，保持增量友好）。
- 若 `expectedVersion` 已在 schema 但路由未校验，属协议缺口，本任务修复它。
