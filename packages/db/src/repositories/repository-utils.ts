export type DelegateCall = (args: unknown) => Promise<unknown>;
export type RawQueryCall = (query: unknown) => Promise<unknown>;

export interface UpdateCount {
  count: number;
}

export function activeByUser(userId: string): Record<string, unknown> {
  return { userId, deletedAt: null };
}

export function softDeleteData(now = new Date()): Record<string, unknown> {
  return { deletedAt: now, version: { increment: 1 } };
}

export function versionedUpdateData(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, version: { increment: 1 } };
}
