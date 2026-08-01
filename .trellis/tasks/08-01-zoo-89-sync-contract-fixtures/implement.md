# ZOO-89: Implement — execution plan for versioned sync contract and fixtures

## Order of execution

1. **协议权威化（`packages/sync/src/`）**
   - `protocol.ts`：新增 `SYNC_CONTRACT_VERSION`、`DEFAULT_PAGE_LIMIT`、`MAX_PAGE_LIMIT`；统一定义 `SyncEntity`/`SyncOperation`/`SyncMutation`/`SyncRecord`/`SyncPullRequest`/`SyncPullResponse`/`SyncPushRequest`/`SyncPushResponse`/`SyncErrorCode`/`AppliedMutation`；保留并统一 `normalizeCursor`，新增 `applyPageLimit`、`buildNextCursor`。
   - 删除分支字段 `/src/indexes.ts` 或并入 `protocol.ts`（按简洁合并）。
   - 将 Zod validators（syncEntity/Operation/Mutation/Pull/Push schema）迁入 sync 包。
2. **Fixtures（`packages/sync/src/fixtures/*.json`）** — 6-7 个如上 design 表格所列。
3. **Contract tests（`packages/sync/src/protocol.test.ts`）** — **驱动真实行为而非自我断言 expected JSON**：
   - ZOO-104：`paginateEntities` + `decodePageCursor`/`encodePageCursor`/`afterPositionPredicate` 爬山到收敛，覆盖 limit+1、跨实体时间交错、同时间戳 tie-breaker、多页收敛。
   - ZOO-107：`casUpdate` 用 in-memory mock store 验证同一 expectedVersion 最多一个成功、冲突回读当前记录、not_found 与 conflict 不混淆。
   - ZOO-108：`contractVersionSupported` 门禁 + fixtures 形状校验。
4. **Web 路由修复**
   - `apps/web/src/app/api/sync/pull/route.ts`：复用 sync 包 normalizeCursor/applyPageLimit，envelope 加 contractVersion/limit，返回 nextCursor/hasMore/limit/contractVersion（保留 cursor 别名）。
   - `apps/web/src/app/api/sync/push/route.ts`：create 接受客户端 `id` 幂等；update/delete/mark 校验 expectedVersion 返回 version_conflict；响应加 contractVersion；错误码补全。
5. **`@mewmo/shared` 去重**：删除 `src/types/index.ts` 中重复的 Sync* 类型与 `src/validators/content.ts` 中的 sync schema，改为从 `@mewmo/sync` re-export（保持既有 import 路径稳定）。
6. **Update `@mewmo/sync` package.json**：依赖 `@mewmo/shared` 可能反向？→ 保持 sync 不依赖 shared；shared 依赖 sync。检查循环依赖：shared → sync 即可（现有 sync 依赖 shared，需评估反转）。若 shared 依赖 sync 而 sync 又依赖 shared 会成环 —— **避免环**：sync 保持零内部依赖，shared 依赖 sync。确认当前 `sync/package.json` 的 `@mewmo/shared` 依赖需移除（sync 不再依赖 shared）。

## Validation

- `pnpm --filter @mewmo/sync lint && pnpm --filter @mewmo/sync test && pnpm --filter @mewmo/sync build`
- `pnpm --filter @mewmo/shared lint && pnpm --filter @mewmo/shared test && pnpm --filter @mewmo/shared build`
- `pnpm --filter @mewmo/web lint && pnpm --filter @mewmo/web build`
- 全仓 CI 门禁：`pnpm lint && pnpm test:unit && pnpm build && pnpm test:theme`（`pnpm test:unit` 已含 sync/shared 包 vitest + turbo test）

## Review Gates

- 语义清单一遍通过（contractVersion/cursor/tombstone/version/idempotency/conflict/pagination/compatibility 都在代码 + fixtures 落地）。
- shared re-export 不破坏既有消费方（grep 确认 sync* 仍可 import）。
- 无 DB schema/migration 改动。

## Rollback

- 全部改动集中在 `packages/sync`、`packages/shared`、`apps/web/src/app/api/sync/*` 三个面；回滚即 revert PR。
