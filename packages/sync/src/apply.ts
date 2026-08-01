import type { SyncErrorCode } from "./protocol";

/**
 * Storage-agnostic optimistic-concurrency (CAS) core for the sync push apply.
 *
 * The atomicity guarantee lives in the `write` predicate: the caller's write
 * includes `version: expectedVersion` in its WHERE clause, so two concurrent
 * writes carrying the same expectedVersion cannot both affect a row — the
 * affected count collapses to whichever transaction commits first (at most one
 * succeeds). This closes the read-check-then-write race that a separate
 * `findFirst` + unconditional `updateMany` would leave open.
 *
 * When the CAS misses we re-read the current row so the caller can report
 * `version_conflict` with the latest server state instead of a misleading
 * `not_found`. Omitting `expectedVersion` keeps the legacy unconditional-apply
 * behavior for backward compatibility.
 */

export type CasRow = { id: string; version: number; deletedAt: Date | null };

export type CasOutcome =
  | { applied: true }
  | { applied: false; reason: "not_found" }
  | { applied: false; reason: "conflict"; current: CasRow };

export interface CasOptions {
  readCurrent: () => Promise<CasRow | null>;
  /** Perform the atomic write and return the affected row count. */
  write: (where: Record<string, unknown>) => Promise<{ count: number }>;
  expectedVersion?: number;
}

export async function casUpdate(opts: CasOptions): Promise<CasOutcome> {
  const where: Record<string, unknown> = { deletedAt: null };
  if (opts.expectedVersion !== undefined) {
    where.version = opts.expectedVersion;
  }

  if (opts.expectedVersion !== undefined) {
    // Atomic path: the version is encoded in the write condition.
    const { count } = await opts.write(where);
    if (count > 0) return { applied: true };

    const current = await opts.readCurrent();
    if (!current || current.deletedAt) return { applied: false, reason: "not_found" };
    return { applied: false, reason: "conflict", current };
  }

  // Legacy unconditional path: no version guard, just apply.
  const { count } = await opts.write(where);
  if (count > 0) return { applied: true };
  return { applied: false, reason: "not_found" };
}

/** Map a CasOutcome to the protocol's push error result. */
export function casOutcomeToResult(
  outcome: CasOutcome,
  expectedVersion: number | undefined,
): { ok: true } | { ok: false; code: SyncErrorCode; message?: string; record?: CasRow } {
  if (outcome.applied) return { ok: true };
  if (outcome.reason === "conflict") {
    return {
      ok: false,
      code: "version_conflict",
      message: `expected version ${expectedVersion}, found ${outcome.current.version}`,
      record: outcome.current,
    };
  }
  return { ok: false, code: "not_found" };
}
