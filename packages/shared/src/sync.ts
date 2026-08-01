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
  SYNC_ERROR_CONTRACT_UNSUPPORTED,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  syncEntities,
  syncOperations,
  applyPageLimit,
  buildNextCursor,
  hasMorePage,
  normalizeCursor,
  createEmptyRecords,
  contractVersionSupported,
  decodePageCursor,
  encodePageCursor,
  comparePositions,
  paginateEntities,
  afterPositionPredicate,
  syncEntitySchema,
  syncOperationSchema,
  syncMutationSchema,
  syncPullSchema,
  syncPushSchema,
  casUpdate,
  casOutcomeToResult,
} from "@mewmo/sync";

export type {
  SyncEntity,
  SyncOperation,
  SyncErrorCode,
  SyncMutation,
  SyncRecord,
  SyncPosition,
  SyncCursorState,
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
  CasRow,
  CasOutcome,
} from "@mewmo/sync";
