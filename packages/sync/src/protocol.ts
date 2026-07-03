export const syncEntities = ["note", "clip", "feed", "feed_entry"] as const;

export type SyncEntity = (typeof syncEntities)[number];
export type SyncOperation = "create" | "update" | "delete" | "mark_read" | "mark_unread";

export interface SyncMutation {
  entity: SyncEntity;
  op: SyncOperation;
  id?: string;
  data?: Record<string, unknown>;
}

export interface SyncPullResponse<TRecord = unknown> {
  cursor: string;
  records: Record<SyncEntity, TRecord[]>;
}

export function normalizeCursor(cursor?: string): Date {
  if (!cursor) return new Date(0);

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return new Date(0);

  return parsed;
}

export function createEmptyRecords<TRecord>() {
  return {
    note: [] as TRecord[],
    clip: [] as TRecord[],
    feed: [] as TRecord[],
    feed_entry: [] as TRecord[],
  };
}
