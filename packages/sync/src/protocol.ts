import { z } from "zod";

/**
 * ZOO-89: canonical cross-platform sync contract.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the sync protocol shared by the
 * Web backend and future Apple (Swift) clients. `@mewmo/shared` re-exports these
 * types/validators so existing imports keep working. Do not define a second copy
 * of the sync protocol anywhere else.
 *
 * Platform-neutral fixtures (see `src/fixtures/*.json`) are plain JSON that the
 * Swift side can consume without a TypeScript runtime; the zod schemas here only
 * validate the same shape that the fixtures exercise.
 */

/** Entities that participate in incremental sync. */
export const syncEntities = ["note", "clip", "feed", "feed_entry"] as const;
export type SyncEntity = (typeof syncEntities)[number];

export const syncOperations = ["create", "update", "delete", "mark_read", "mark_unread"] as const;
export type SyncOperation = (typeof syncOperations)[number];

/** Major contract version. Same-major requests are backward compatible. */
export const SYNC_CONTRACT_VERSION = 1 as const;

/** Pull pagination bounds. */
export const DEFAULT_PAGE_LIMIT = 200;
export const MAX_PAGE_LIMIT = 500;

/** Error codes the push endpoint may return per mutation. */
export type SyncErrorCode =
  | "missing_id"
  | "invalid_note"
  | "invalid_clip"
  | "invalid_feed_entry"
  | "not_found"
  | "version_conflict"
  | "duplicate_clip"
  | "unsupported_operation"
  | "unsupported_entity";

/** A single client-side mutation to apply on push. */
export interface SyncMutation {
  entity: SyncEntity;
  op: SyncOperation;
  id?: string | undefined;
  /** `id` for create idempotency (client-generated or omitted for server default). */
  data: Record<string, unknown>;
  /** Optional client-provided identity, echoed back in the push response. */
  clientMutationId?: string | undefined;
}

/** Core syncable record shape (id + version + updatedAt + soft-delete tombstone). */
export interface SyncRecord {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  userId: string;
}

/** Pull request envelope. */
export interface SyncPullRequest {
  /** Optional; defaults to 1 for backward compatibility. */
  contractVersion?: number | undefined;
  /** Incremental sync cursor; ISO-8601 `updatedAt` value. Empty/missing = epoch. */
  cursor?: string | undefined;
  /** Pagination page size. Clamped to [1, MAX_PAGE_LIMIT]. */
  limit?: number | undefined;
}

/** Pull response envelope. */
export interface SyncPullResponse<TRecord = SyncRecord> {
  contractVersion: number;
  cursor: string;
  /** Alias of `cursor` kept for backward compatibility with existing callers. */
  nextCursor: string;
  hasMore: boolean;
  limit: number;
  records: Record<SyncEntity, TRecord[]>;
}

/** Push request envelope. */
export interface SyncPushRequest {
  /** Optional; defaults to 1 for backward compatibility. */
  contractVersion?: number | undefined;
  mutations: SyncMutation[];
}

/** A mutation that was applied successfully (record = resulting latest entity state). */
export interface AppliedMutation<TRecord = SyncRecord> {
  index: number;
  entity: SyncEntity;
  op: SyncOperation;
  record: TRecord | null;
  clientMutationId?: string | undefined;
}

/** A mutation that failed. `record` carries the current server state on version conflicts. */
export interface SyncMutationError<TRecord = SyncRecord> {
  index: number;
  code: SyncErrorCode;
  message?: string | undefined;
  clientMutationId?: string | undefined;
  record?: TRecord | undefined;
}

/** Push response envelope. */
export interface SyncPushResponse<TRecord = SyncRecord> {
  contractVersion: number;
  applied: AppliedMutation<TRecord>[];
  errors: SyncMutationError<TRecord>[];
}

// ---------------------------------------------------------------------------
// Pure protocol helpers (shared between Web and any future client).
// ---------------------------------------------------------------------------

/** Parse a pull cursor into a Date; missing/garbage cursor normalizes to epoch. */
export function normalizeCursor(cursor?: string): Date {
  if (!cursor) return new Date(0);

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return new Date(0);

  return parsed;
}

/** Clamp a requested page size into [1, MAX_PAGE_LIMIT]. */
export function applyPageLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) return DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) return MAX_PAGE_LIMIT;
  return limit;
}

/**
 * Compute the next time cursor from the last record of the current page.
 * Returning the last record's own `updatedAt` (not the wall-clock) guarantees a
 * subsequent page over `updatedAt > nextCursor` does not skip rows whose
 * timestamps fall inside the gap between query time and now.
 */
export function buildNextCursor<TRecord extends { updatedAt: string }>(
  records: readonly TRecord[],
  fallback: string,
): string {
  const last = records[records.length - 1];
  return last ? last.updatedAt : fallback;
}

/**
 * Tells whether a page has more data. `count` = number of rows actually fetched
 * against `limit`; if the fetch is at-capacity there may be more, so the caller
 * pages again.
 */
export function hasMorePage(count: number, limit: number): boolean {
  return count >= limit;
}

export function createEmptyRecords<TRecord>() {
  return {
    note: [] as TRecord[],
    clip: [] as TRecord[],
    feed: [] as TRecord[],
    feed_entry: [] as TRecord[],
  };
}

// ---------------------------------------------------------------------------
// Zod validators (mirror of the interfaces above).
// ---------------------------------------------------------------------------

export const syncEntitySchema = z.enum(["note", "clip", "feed", "feed_entry"]);
export const syncOperationSchema = z.enum([
  "create",
  "update",
  "delete",
  "mark_read",
  "mark_unread",
]);

export const syncMutationSchema = z.object({
  entity: syncEntitySchema,
  op: syncOperationSchema,
  id: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  clientMutationId: z.string().min(1).optional(),
});

export const syncPullSchema = z.object({
  contractVersion: z.number().int().positive().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
});

export const syncPushSchema = z.object({
  contractVersion: z.number().int().positive().optional(),
  mutations: z.array(syncMutationSchema).min(1),
});

/** Simple type-level inference payloads (kept for consumer ergonomics). */
export type SyncPullRequestInput = z.input<typeof syncPullSchema>;
export type SyncPullRequestParsed = z.output<typeof syncPullSchema>;
export type SyncPushRequestInput = z.input<typeof syncPushSchema>;
export type SyncPushRequestParsed = z.output<typeof syncPushSchema>;
