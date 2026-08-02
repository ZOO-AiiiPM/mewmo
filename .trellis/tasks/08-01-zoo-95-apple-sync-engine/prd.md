# ZOO-95 Apple SyncEngine

## Goal

在现有 SwiftData 本地数据层与 ZOO-93 authenticated client 之上交付 Apple 端的本地优先同步引擎。应用冷启动始终先读本地数据，网络同步只能在后台推进本地缓存，不能阻塞读取路径。

## Requirements

- 仅修改 `apps/apple` 的 SyncEngine、focused tests、`project.yml`、README 和本任务 artifacts。
- 复用 ZOO-89 v1 JSON fixtures、`LocalStore` / durable outbox 和 `AuthenticatedHTTPClient`；调用既有 `POST /api/sync/pull` 与 `POST /api/sync/push`，不改服务端契约。
- pull 保存每账号 cursor，并分页直到 `hasMore=false`；每页先将 records（含 tombstone）落入 SwiftData，再推进 cursor，避免中断时遗漏未落库数据。
- push 按 FIFO 分批发送 durable outbox，只有响应中的 `applied` mutation 才 ack。`payloadJSON` 是 canonical ZOO-89 per-mutation wire object（`entity`、`op`、可选 `id`、`data`、可选 `clientMutationId`）；持久 metadata 必须与其一致，不一致的行 fail closed 并保留。可重试错误保留在 outbox，`version_conflict` 按服务器 record 下沉本地并移除该条 mutation，避免无限重放陈旧写入。
- 同一 `clientMutationId` 必须保持不变，重试可安全复用服务端幂等语义。客户端本地入队重复 mutation id 由已有 store 幂等处理。
- 同步支持启动、应用回到前台、网络恢复触发；单实例互斥，未认证或网络不可用时可诊断地跳过，不读取/记录 bearer token。

## Boundaries

- 不改 Web API、Prisma schema、`packages/shared`、业务 UI、图片缓存或 AI。
- 不自建协议/wrapper；ZOO-89 contract 与 ZOO-93 authenticated client 是跨端边界的唯一真相源。
- 本 issue 不实现完整冲突合并。冲突时保存服务端权威 record，丢弃无法安全重放的陈旧 outbox mutation。

## Acceptance Criteria

- [x] `SyncEngine` 以 actor 串行化同步运行，并公开不含敏感信息的诊断状态。
- [x] pull 能消费 ZOO-89 fixtures，应用增量记录和 tombstone，并在成功落库后持久化 cursor。
- [x] push 以有限批次、FIFO、精确 ack 处理 outbox；重试不改 mutation id；同批 partial failure 不丢未确认项。
- [x] version conflict 落下服务器记录并移除冲突 mutation；其他失败保留重试。
- [x] app 启动/前后台/网络恢复只触发后台同步，本地读取不等待同步完成。
- [x] focused fixture-driven tests 覆盖 pull、push、retry、idempotency、tombstone、conflict、互斥与敏感日志边界。
- [x] `make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check` 均通过。
