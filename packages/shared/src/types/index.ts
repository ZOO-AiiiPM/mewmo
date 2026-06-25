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

