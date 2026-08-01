/**
 * ZOO-89: sync protocol re-exports.
 *
 * The canonical sync protocol (types + zod validators + helpers) lives in
 * `@mewmo/sync`. `@mewmo/shared` re-exports it here so existing consumers that
 * import sync symbols from `@mewmo/shared` keep compiling. Do not redefine the
 * protocol in this package — forward to `@mewmo/sync` instead.
 */
export {
  SYNC_CONTRACT_VERSION,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  syncEntities,
  syncOperations,
  applyPageLimit,
  buildNextCursor,
  hasMorePage,
  normalizeCursor,
  createEmptyRecords,
  syncEntitySchema,
  syncOperationSchema,
  syncMutationSchema,
  syncPullSchema,
  syncPushSchema,
} from "@mewmo/sync";

export type {
  SyncEntity,
  SyncOperation,
  SyncErrorCode,
  SyncMutation,
  SyncRecord,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  AppliedMutation,
  SyncMutationError,
  SyncPushResponse,
  SyncPullRequestInput,
  SyncPullRequestParsed,
  SyncPushRequestInput,
  SyncPushRequestParsed,
} from "@mewmo/sync";
