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

/** Stable error code returned when a client advertises a too-new contract. */
export const SYNC_ERROR_CONTRACT_UNSUPPORTED = "contract_version_unsupported" as const;

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
  /**
   * Incremental sync cursor.
   * - Composite form (JSON, produced by this server): per-entity keyset position.
   * - Legacy form (plain ISO-8601 timestamp): resumes every entity from that time.
   * - Missing/empty: full sync from epoch.
   */
  cursor?: string | undefined;
  /** Pagination page size. Clamped to [1, MAX_PAGE_LIMIT]. */
  limit?: number | undefined;
}

/**
 * Keyset position of a single entity's last returned record.
 * `(updatedAt, id)` ordered ascending; `id` is the stable tie-breaker so rows
 * sharing an `updatedAt` are never skipped or duplicated across pages.
 */
export interface SyncPosition {
  updatedAt: string;
  id: string;
}

/** Composite pull cursor: one keyset position per syncable entity. */
export type SyncCursorState = Partial<Record<SyncEntity, SyncPosition>>;

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

/**
 * Reject clients that claim a newer major contract than the server speaks.
 * Missing contractVersion is treated as 1 (backward compatible).
 */
export function contractVersionSupported(candidate?: number): boolean {
  return (candidate ?? 1) <= SYNC_CONTRACT_VERSION;
}

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

const CURSOR_PREFIX = "mewmo-sync-v1:";

/**
 * Encode a composite keyset cursor into an opaque string for transport.
 * Empty state (nothing returned yet) encodes to null so the client sends no
 * cursor on the first page.
 */
export function encodePageCursor(state: SyncCursorState | undefined): string | null {
  const hasPosition =
    state != null && syncEntities.some((entity) => state[entity] !== undefined);
  if (!hasPosition) return null;
  return `${CURSOR_PREFIX}${JSON.stringify(state)}`;
}

/**
 * Decode a client-supplied pull cursor into per-entity keyset positions.
 * Handles:
 *  - composite form (produced by encodePageCursor)
 *  - legacy plain ISO timestamp (resumes every entity from that time)
 *  - missing/garbage → empty state (full sync from epoch)
 */
export function decodePageCursor(cursor?: string): SyncCursorState {
  if (!cursor) return {};

  const composite = parseCompositeCursor(cursor);
  if (composite) return composite;

  // Legacy plain ISO timestamp: resume every entity from that time (empty id => all ids).
  const legacy = new Date(cursor);
  if (!Number.isNaN(legacy.getTime())) {
    const position: SyncPosition = { updatedAt: legacy.toISOString(), id: "" };
    return {
      note: position,
      clip: position,
      feed: position,
      feed_entry: position,
    };
  }

  return {};
}

function parseCompositeCursor(cursor: string): SyncCursorState | null {
  if (!cursor.startsWith(CURSOR_PREFIX)) return null;
  const encoded = cursor.slice(CURSOR_PREFIX.length);
  let raw: unknown;
  try {
    raw = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const state: SyncCursorState = {};
  for (const entity of syncEntities) {
    const entry = (raw as SyncCursorState)[entity];
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.updatedAt === "string" &&
      typeof entry.id === "string"
    ) {
      state[entity] = { updatedAt: entry.updatedAt, id: entry.id };
    }
  }
  return state;
}

/**
 * Compare two keyset positions `(updatedAt, id)` ascending. Returns -1, 0, 1.
 */
export function comparePositions(a: SyncPosition, b: SyncPosition): number {
  const aTime = new Date(a.updatedAt).getTime();
  const bTime = new Date(b.updatedAt).getTime();
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  // id "" sorts before any real id, preserving "everything at this timestamp".
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Keyset predicate for "strictly after this position": rows with an equal
 * `updatedAt` are still eligible when their id is greater, so same-timestamp
 * rows are never skipped or re-returned across pages.
 */
export function afterPositionPredicate(
  position: SyncPosition | undefined,
  timestampField = "updatedAt",
  idField = "id",
): Record<string, unknown> {
  if (!position) return {};
  return {
    OR: [
      { [timestampField]: { gt: new Date(position.updatedAt) } },
      {
        [timestampField]: new Date(position.updatedAt),
        [idField]: { gt: position.id },
      },
    ],
  };
}

/**
 * Pure pagination core over per-entity fetched lists.
 *
 * Each entity list is expected sorted ascending by `(updatedAt, id)` and its
 * length is at most `limit + 1` (the extra row only detects hasMore). It returns
 * up to `limit` records per entity, the exact boundary (`next state`) from which
 * the next page must resume, and a global `hasMore` flag that is true when any
 * entity still has rows beyond the returned page.
 *
 * Because the returned boundary is the actual last *returned* row, the hidden
 * `limit+1`-th row is re-fetched on the next page (via `afterPositionPredicate`)
 * instead of being silently skipped.
 */
export type PageableRecord = {
  id: string;
  updatedAt: string | Date;
};

export function paginateEntities<TRecord extends PageableRecord>(
  fetched: Record<SyncEntity, TRecord[]>,
  limit: number,
): { records: Record<SyncEntity, TRecord[]>; nextState: SyncCursorState; hasMore: boolean } {
  const records = createEmptyRecords<TRecord>();
  const nextState: SyncCursorState = {};
  let hasMore = false;

  for (const entity of syncEntities) {
    const rows = fetched[entity] ?? [];
    if (rows.length > limit) {
      hasMore = true;
      records[entity] = rows.slice(0, limit);
    } else {
      records[entity] = rows;
    }
    const boundary = records[entity][records[entity].length - 1];
    if (boundary) {
      nextState[entity] = {
        updatedAt:
          boundary.updatedAt instanceof Date
            ? boundary.updatedAt.toISOString()
            : String(boundary.updatedAt),
        id: boundary.id,
      };
    }
  }

  return { records, nextState, hasMore };
}

/**
 * Compute the next time cursor from the last record of the current page.
 * Retained for backward compatibility with legacy time-cursor callers.
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
  cursor: z.string().min(1).optional(),
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
