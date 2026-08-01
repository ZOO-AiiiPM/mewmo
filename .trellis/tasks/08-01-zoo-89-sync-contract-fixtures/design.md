# ZOO-89: Design — versioned cross-platform sync contract and fixtures

## 1. Goal & Boundary

把同步协议固化为版本化、平台中立、可由 Swift 直接消费的 contract。改动集中在：

- `packages/sync/`：成为协议**唯一权威源**（类型 + 常量 + 纯函数 + fixtures + contract tests）。
- `packages/shared/src/types/` 与 `packages/shared/src/validators/`：改为**复用** sync 包定义，删除重复协议类型。
- `apps/web/src/app/api/sync/pull|push`：修复协议缺口，使其行为符合 contract。

**不改 DB schema、不加迁移**。`SyncCursor` 表保持现状。

## 2. 当前缺口（审计结论）

| # | 缺口 | 影响 |
|---|------|------|
| G1 | `@mewmo/sync` 与 `@mewmo/shared` 双协议定义不一致（`cursor` vs `nextCursor`），sync 包无人消费 | 协议无单一权威源；Apple 端无处对齐 |
| G2 | push 忽略 schema 里的 `expectedVersion` | 无乐观并发，客户端可能静默覆盖新数据 |
| G3 | create 不接受客户端 `id`（note 用 slug、clip 用 normalizedUrl 判重） | 重复 push 对 note 会真重复创建（slug 加后缀），幂等缺失 |
| G4 | pull 无分页、无 `nextCursor` | 增量数据量大时单响应过大，无续传 |
| G5 | pull 路由带本地 `normalizeCursor` 副本 | 分散重复，演进不一致 |
| G6 | 协议没有 contract 版本/兼容策略 | 跨端无法安全演进 |

## 3. 语义定义（契约正文）

### Contract Version & Compatibility

- 常量 `SYNC_CONTRACT_VERSION = 1`（整数，majour version）。
- 兼容策略：**同一大版本内向后兼容**。新字段总是 optional；解析器**忽略未知字段**；服务端拒绝 `contractVersion > SYNC_CONTRACT_VERSION` 的请求（客户端太新），对 `contractVersion < 当前` 沿用旧行为（服务端兼容）。
- `contractVersion` 由 pull/push 客户端在 envelope 提交（optional，缺省视为 1）。

### Cursor

- **增量游标**沿用现有 ISO 时间游标（`updatedAt > cursor`，服务端返回新的 `nextCursor`）。这是当前唯一游标类型（`cursorKind: "updated_at"`）。
- 为未来演进保留分页：pull envelope 增加 `limit`（optional，默认 `DEFAULT_PAGE_LIMIT = 200`，上限 `MAX_PAGE_LIMIT = 500`），响应带 `nextCursor` 与 `hasMore`（records 总数触顶则 true）。
- `normalizeCursor` 由 sync 包提供唯一实现，Web 复用。

### Tombstone

- 软删除：delete 只置 `deletedAt`（+version 递增），不物理删除。pull 的 records 携带 `deletedAt`（时间游标按 `updatedAt` 覆盖），使客户端可下沉删除。

### Version & Idempotency

- **version**：服务端每实体维护，乐观并发基准。create 后 `version = 1`；update/delete/mark 请求携 `expectedVersion`，服务端校验 `expectedVersion === 当前 version` 才应用并 `version + 1`。
- **idempotent create**：客户端可在 create 时提供 `id`（cuid 语义由客户端生成 / 服务端缺省生成），服务端按 `(userId, id)` upsert；已存在且未删除 → 返回现有记录（幂等，不重复创建）。note/clip 的现有 slug/normalizedUrl 判重保留为自然幂等（同一数据重复创建返回同记录）。
- **clientMutationId**：push envelope 允许每个 mutation 带 `clientMutationId`，服务端用于日志/去重追踪；本版本以 `id` 幂等为主，`clientMutationId` 为可选项不做持久化去重（避免引入额外的去重表——超出范围）。

### Conflict

- update/delete/mark 如果 `expectedVersion` 不匹配当前版本 → 返回 `result_code: "version_conflict"`，并回传当前最新记录（`record`），客户端可据此决定 rebase。不静默覆盖。
- 兼容：不携 `expectedVersion` 的请求沿用「无条件应用」旧行为（G2 修复对旧客户端兼容），但新契约文档鼓励客户端始终携带。

### Pull / Push Response Envelope

统一成功/失败语义：

- Pull 响应：`{ contractVersion, cursor, nextCursor, hasMore, limit, records: { note[], clip[], feed[], feed_entry[] }, tombstones? }`。records 每项即完整实体（含 `deletedAt` 即 tombstone 语义）。
- Push 响应：`{ contractVersion, applied: [{ clientMutationId?, index, entity, op, record }], errors: [{ index, clientMutationId?, code, message? }] }`。错误码：`missing_id / invalid_note / invalid_clip / not_found / version_conflict / duplicate_clip / unsupported_operation / unsupported_entity / validation_failed`。

## 4. 目录与文件结构（`packages/sync`）

```
packages/sync/src/
  protocol.ts         ← 常量(SYNC_CONTRACT_VERSION, entities, ops, limit)+类型+纯函数(唯一权威)
  indexes.ts          ← cursor/pagination 纯函数（normalizeCursor, applyPageLimit）
  protocol.test.ts    ← 单元 + 契约测试（读 fixtures/ 校验）
  fixtures/*.json     ← 平台中立 JSON fixtures
  fixtures/README.md  ← 说明 + Swift 消费指引
```

同步删除 `@mewmo/shared` 中的重复 sync 协议类型与 validators(syncPullSchema/syncPushSchema/syncMutationSchema/syncOperationSchema/syncEntitySchema)，改为 re-export sync 包（保持现有 import 兼容：`@mewmo/shared` 继续暴露 `syncPullSchema` 等，实际转发自 `@mewmo/sync`）。

## 5. Web 端协议缺口修复（仅协议层）

`apps/web/src/app/api/sync/pull/route.ts`：
- 引 `@mewmo/sync` 的 `normalizeCursor` 与 `applyPageLimit`（删本地副本）。
- envelope 解析 `contractVersion`、`cursor`、`limit`。
- 按 `limit` 截断并计算 `hasMore`，返回 `nextCursor`（时间游标 = 上次返回最后一条的 `updatedAt`，保证续传不丢）与 `hasMore`、`limit`、`contractVersion`。
- 兼容：`nextCursor` 仍为 ISO 时间（对既有客户端向后兼容）。

`apps/web/src/app/api/sync/push/route.ts`：
- create 支持客户端 `id`：存在 → 幂等返回；不存在 → 用该 id 创建。
- update/delete/mark 读取 `data.expectedVersion`（note/clip 已有字段）在路由层校验并返回 `version_conflict`。
- 响应加 `contractVersion`，错误码补全。
- feed 实体 apply 目前是 `unsupported_entity`（feed 无客户端直达 mutation），保持。

共享 validators（`syncMutationSchema`/`syncPullSchema`/`syncPushSchema`）在 sync 包重建并扩展字段，Web 复用。

## 6. Fixtures（平台中立 JSON）

`contractVersion` 恒为 1。文件命名与内容：

| fixture | 场景 | 关键断言 |
|---------|------|---------|
| `pull-incremental.json` | 增量拉取：cursor 之前/之后各记录 | cursor 过滤正确、nextCursor 推进 |
| `pull-pagination.json` | 分页：记录数 > limit | hasMore=true、第二页补全 |
| `pull-tombstones.json` | 软删除记录随 pull 下沉 | deletedAt 非空随记录返回 |
| `push-create-idempotent.json` | 重复 create 同 id | 同 id 不重复创建，记录一致 |
| `push-update-conflict.json` | expectedVersion 不匹配 | version_conflict + 当前记录回传 |
| `push-mutations-composite.json` | 混合 create/update/delete/mark 一次推送 | 各 op 逐一正确 |
| `push-errors.json` | 各类错误码 | not_found / missing_id / unsupported 等 |

fixtures 同时给出「输入（请求体）」与「期望（响应体）」或纯「期望记录快照」，供 contract test 读取断言；Swift 端直接读 JSON 作样本。

## 7. 兼容性 / 演进

- 旧客户端不携 `contractVersion` → 视为 1（向后兼容）。
- 旧客户端不携 `expectedVersion` → update 仍无条件应用（兼容），但新客户端应携带。
- `nextCursor` 仍是 ISO 时间，字段名从现有 pull 的 `cursor` 演进为 `nextCursor`；pull 响应同时保留 `cursor` 别名（= `nextCursor`）避免破坏既有调用方。
- 不做 DB 迁移；`SyncCursor` 表未启用，维持现状。

## 8. Tradeoffs

- **以时间游标 + expectedVersion 乐观并发**为契约核心，不实现 version vector / LWW（超出范围，与 architecture.md「不要把规划中的 version vector 当现有能力」一致）。
- **幂等以 id upsert 为主**，clientMutationId 不做持久去重，避免引去重表（范围外）。
- fixture 采用「输入/期望 JSON」而非 TS 枚举，确保 Swift 可独立消费。
