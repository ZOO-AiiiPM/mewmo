export type SourceStatus = "ok" | "unhealthy" | "pending";

export interface EntityBase {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletable {
  deletedAt: Date | null;
}

export interface VersionedEntity {
  version: number;
}

export interface QueueJob<TPayload> {
  name: string;
  payload: TPayload;
}

export interface StorageObject {
  path: string;
  url: string;
}

export interface EmailEnvelope {
  to: string;
  subject: string;
  html: string;
}

export type SyncEntity = "note" | "clip" | "feed" | "feed_entry";

export type SyncOperation = "create" | "update" | "delete" | "mark_read" | "mark_unread";

export interface SyncMutation {
  entity: SyncEntity;
  op: SyncOperation;
  id?: string | undefined;
  data: Record<string, unknown>;
}

export interface SyncRecord extends EntityBase, SoftDeletable, VersionedEntity {
  userId: string;
}

export interface SyncPullResponse<TRecord = SyncRecord> {
  nextCursor: string;
  records: Record<SyncEntity, TRecord[]>;
}
