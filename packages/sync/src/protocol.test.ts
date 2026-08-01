import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  SYNC_CONTRACT_VERSION,
  SYNC_ERROR_CONTRACT_UNSUPPORTED,
  afterPositionPredicate,
  applyPageLimit,
  comparePositions,
  contractVersionSupported,
  createEmptyRecords,
  decodePageCursor,
  encodePageCursor,
  normalizeCursor,
  paginateEntities,
  syncEntities,
  syncPullSchema,
  syncPushSchema,
  type SyncCursorState,
  type SyncEntity,
  type SyncRecord,
} from "./protocol";
import { casUpdate, type CasOutcome, type CasRow } from "./apply";

function readJson(name: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, `fixtures/${name}.json`), "utf8");
}

// ---------------------------------------------------------------------------
// Helpers used to drive REAL behavior (not self-asserted expected JSON).
// ---------------------------------------------------------------------------

type StoredRow = {
  id: string;
  version: number;
  updatedAt: Date;
  deletedAt: Date | null;
  userId: string;
};

/** A minimal in-memory dataset simulating one entity's table on the server. */
function makeDataset(rows: Array<{ id: string; updatedAt: string; version?: number }>): StoredRow[] {
  return rows
    .map((r) => ({
      id: r.id,
      version: r.version ?? 1,
      updatedAt: new Date(r.updatedAt),
      deletedAt: null,
      userId: "user-1",
    }))
    .sort((a, b) => {
      const t = a.updatedAt.getTime() - b.updatedAt.getTime();
      if (t !== 0) return t;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Fake server-side entity query: applies the keyset predicate `(updatedAt, id)`
 * over an in-memory dataset, fetches at most `take` rows in asc order. This
 * mirrors exactly what the web pull route builds against Prisma.
 */
function queryRange(dataset: StoredRow[], position: { updatedAt: string; id: string } | undefined, take: number) {
  const pred = afterPositionPredicate(position);
  const rows = dataset.filter((row) => {
    if (!pred.OR) return true;
    const gt = pred.OR[0]!.updatedAt as { gt: Date };
    const eq = pred.OR[1]! as { updatedAt: Date; id: { gt: string } };
    const rowTime = row.updatedAt.getTime();
    if (rowTime > gt.gt.getTime()) return true;
    if (rowTime === eq.updatedAt.getTime() && row.id > eq.id.gt) return true;
    return false;
  });
  return rows.slice(0, take);
}

/** Walk pages over all entities until convergence; returns fetched records + final cursor. */
async function crawlAll(
  datasets: Record<SyncEntity, StoredRow[]>,
  limit: number,
): Promise<{ seen: StoredRow[]; finalCursor: string | undefined }> {
  let cursor: string | undefined;
  const seen: StoredRow[] = [];
  let guard = 0;

  while (true) {
    guard += 1;
    if (guard > 1_000) throw new Error("crawl did not converge");

    const positions = decodePageCursor(cursor);
    const fetched = {} as Record<SyncEntity, StoredRow[]>;
    for (const entity of syncEntities) {
      fetched[entity] = queryRange(datasets[entity], positions[entity], limit + 1);
    }

    const page = paginateEntities(fetched, limit, positions);
    for (const entity of syncEntities) {
      for (const row of page.records[entity]) seen.push(row);
    }
    cursor = encodePageCursor(page.nextState) ?? undefined;
    if (!page.hasMore) break;
  }

  return { seen, finalCursor: cursor };
}

// ---------------------------------------------------------------------------
// ZOO-104: pull pagination behavior (real algorithm, no expected-JSON self-assert)
// ---------------------------------------------------------------------------

describe("ZOO-104 · keyset cursor encode/decode", () => {
  it("round-trips a composite cursor", () => {
    const state: SyncCursorState = {
      note: { updatedAt: "2026-07-03T10:00:00.000Z", id: "note-9" },
      feed_entry: { updatedAt: "2026-07-03T12:00:00.000Z", id: "fe-3" },
    };
    const encoded = encodePageCursor(state);
    expect(encoded).toContain("mewmo-sync-v1:");
    expect(decodePageCursor(encoded)).toEqual(state);
  });

  it("encodes an empty state to null (first page sends no cursor)", () => {
    expect(encodePageCursor({})).toBeNull();
    expect(encodePageCursor(undefined as unknown as SyncCursorState)).toBeNull();
  });

  it("treats a missing cursor as full sync (empty state)", () => {
    expect(decodePageCursor(undefined)).toEqual({});
    expect(decodePageCursor("")).toEqual({});
  });

  it("resumes a legacy plain ISO cursor from that time for every entity", () => {
    const state = decodePageCursor("2026-07-03T00:00:00.000Z");
    for (const entity of syncEntities) {
      expect(state[entity]).toEqual({ updatedAt: "2026-07-03T00:00:00.000Z", id: "" });
    }
  });

  it("ignores garbage cursor payloads", () => {
    expect(decodePageCursor("mewmo-sync-v1:not-json")).toEqual({});
    expect(decodePageCursor("mewmo-sync-v1:[1,2]")).toEqual({});
    expect(decodePageCursor("mewmo-sync-v1:[]")).toEqual({});
    expect(decodePageCursor("not-a-cursor")).toEqual({});
  });
});

describe("ZOO-104 · comparePositions tie-breaker", () => {
  const p = (updatedAt: string, id: string) => ({ updatedAt, id });
  it("orders by time then id", () => {
    expect(comparePositions(p("2026-07-03T10:00:00.000Z", "a"), p("2026-07-03T08:00:00.000Z", "z"))).toBe(1);
    expect(comparePositions(p("2026-07-03T10:00:00.000Z", "a"), p("2026-07-03T10:00:00.000Z", "b"))).toBe(-1);
    expect(comparePositions(p("2026-07-03T10:00:00.000Z", "a"), p("2026-07-03T10:00:00.000Z", "a"))).toBe(0);
    // empty id sorts first (legacy full-time resume)
    expect(comparePositions(p("2026-07-03T10:00:00.000Z", ""), p("2026-07-03T10:00:00.000Z", "a"))).toBe(-1);
  });
});

describe("ZOO-104 · paginateEntities does not lose rows (crawl to convergence)", () => {
  it("limit+1 hidden row is never skipped (a single overflow entity)", async () => {
    // 5 notes, limit 2 → pages of 2/2/1. The 3rd note lands in page 2, 5th in page 3.
    const datasets = {
      note: makeDataset([
        { id: "n1", updatedAt: "2026-07-01T01:00:00.000Z" },
        { id: "n2", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "n3", updatedAt: "2026-07-01T03:00:00.000Z" },
        { id: "n4", updatedAt: "2026-07-01T04:00:00.000Z" },
        { id: "n5", updatedAt: "2026-07-01T05:00:00.000Z" },
      ]),
      clip: makeDataset([]),
      feed: makeDataset([]),
      feed_entry: makeDataset([]),
    };
    const { seen } = await crawlAll(datasets, 2);
    expect(seen.map((r) => r.id)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  });

  it("cross-entity time interleaving converges without skipping any entity's rows", async () => {
    // notes and feed entries interleave by timestamp; the crawl must return both
    // fully even though they page independently.
    const datasets = {
      note: makeDataset([
        { id: "n1", updatedAt: "2026-07-01T01:00:00.000Z" },
        { id: "n2", updatedAt: "2026-07-01T09:00:00.000Z" },
        { id: "n3", updatedAt: "2026-07-01T11:00:00.000Z" },
      ]),
      clip: makeDataset([]),
      feed: makeDataset([]),
      feed_entry: makeDataset([
        { id: "f1", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "f2", updatedAt: "2026-07-01T03:00:00.000Z" },
        { id: "f3", updatedAt: "2026-07-01T04:00:00.000Z" },
        { id: "f4", updatedAt: "2026-07-01T12:00:00.000Z" },
      ]),
    };
    const { seen } = await crawlAll(datasets, 2);
    expect(seen.map((r) => r.id).sort()).toEqual(["f1", "f2", "f3", "f4", "n1", "n2", "n3"]);
  });

  it("same updatedAt across a page boundary is neither skipped nor duplicated", async () => {
    // 4 notes all sharing one timestamp; limit 2. Tie-break by id must page exactly 2/2.
    const datasets = {
      note: makeDataset([
        { id: "a", updatedAt: "2026-07-01T00:00:00.000Z" },
        { id: "b", updatedAt: "2026-07-01T00:00:00.000Z" },
        { id: "c", updatedAt: "2026-07-01T00:00:00.000Z" },
        { id: "d", updatedAt: "2026-07-01T00:00:00.000Z" },
      ]),
      clip: makeDataset([]),
      feed: makeDataset([]),
      feed_entry: makeDataset([]),
    };
    const { seen } = await crawlAll(datasets, 2);
    expect(seen.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("mixed multi-page crawl across all four entities", async () => {
    const datasets = {
      note: makeDataset([
        { id: "n1", updatedAt: "2026-07-01T01:00:00.000Z" },
        { id: "n2", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "n3", updatedAt: "2026-07-01T03:00:00.000Z" },
      ]),
      clip: makeDataset([
        { id: "c1", updatedAt: "2026-07-01T01:30:00.000Z" },
        { id: "c2", updatedAt: "2026-07-01T02:30:00.000Z" },
      ]),
      feed: makeDataset([{ id: "fd1", updatedAt: "2026-07-01T04:00:00.000Z" }]),
      feed_entry: makeDataset([
        { id: "f1", updatedAt: "2026-07-01T00:30:00.000Z" },
        { id: "f2", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "f3", updatedAt: "2026-07-01T03:30:00.000Z" },
      ]),
    };
    const { seen } = await crawlAll(datasets, 3);
    expect(seen.length).toBe(9);
    const ids = new Set(seen.map((r) => r.id));
    expect(ids.size).toBe(9); // no duplicate fetches
    expect(["n1", "n2", "n3", "c1", "c2", "fd1", "f1", "f2", "f3"].every((id) => ids.has(id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZOO-109: the composite cursor must retain finished-entity positions so they
// are never re-queried from epoch while another entity keeps paginating.
// ---------------------------------------------------------------------------

describe("ZOO-109 · inherited positions prevent replay of exhausted entities", () => {
  it("keeps positions for an entity that exhausts before another finishes (asymmetric pages)", async () => {
    // feed_entry has 7 rows (limit 3 → needs 3 pages); every other entity has 2
    // rows (fits page 1 and then returns empty on later pages).
    const datasets = {
      note: makeDataset([
        { id: "n1", updatedAt: "2026-07-01T01:00:00.000Z" },
        { id: "n2", updatedAt: "2026-07-01T01:10:00.000Z" },
      ]),
      clip: makeDataset([
        { id: "c1", updatedAt: "2026-07-01T01:20:00.000Z" },
        { id: "c2", updatedAt: "2026-07-01T01:30:00.000Z" },
      ]),
      feed: makeDataset([
        { id: "fd1", updatedAt: "2026-07-01T01:40:00.000Z" },
        { id: "fd2", updatedAt: "2026-07-01T01:50:00.000Z" },
      ]),
      feed_entry: makeDataset([
        { id: "f1", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "f2", updatedAt: "2026-07-01T02:10:00.000Z" },
        { id: "f3", updatedAt: "2026-07-01T02:20:00.000Z" },
        { id: "f4", updatedAt: "2026-07-01T02:30:00.000Z" },
        { id: "f5", updatedAt: "2026-07-01T02:40:00.000Z" },
        { id: "f6", updatedAt: "2026-07-01T02:50:00.000Z" },
        { id: "f7", updatedAt: "2026-07-01T03:00:00.000Z" },
      ]),
    };

    const { seen, finalCursor } = await crawlAll(datasets, 3);
    // Converged with no duplicates and nothing lost.
    const ids = seen.map((r) => r.id);
    expect(ids.length).toBe(13);
    expect(new Set(ids).size).toBe(13);
    const feedEntryIds = ids.filter((id) => /^f[1-7]$/.test(id)).sort();
    expect(feedEntryIds).toEqual(["f1", "f2", "f3", "f4", "f5", "f6", "f7"]);

    // The final incremental cursor must still carry known positions for every
    // entity that ever had data — none replayed from epoch afterward.
    const finalPositions = decodePageCursor(finalCursor);
    for (const entity of ["note", "clip", "feed", "feed_entry"] as const) {
      expect(finalPositions[entity]).toBeDefined();
    }
    // Feeding the final cursor straight back must yield zero records (already synced).
    const resumes = {} as Record<SyncEntity, StoredRow[]>;
    for (const entity of syncEntities) {
      resumes[entity] = queryRange(datasets[entity], finalPositions[entity], 10);
    }
    for (const entity of syncEntities) expect(resumes[entity].length).toBe(0);
  });

  it("final cursor after asymmetric convergence does not replay from epoch", async () => {
    // notes exhaust on page 1, feed entries need two pages.
    const datasets = {
      note: makeDataset([{ id: "n1", updatedAt: "2026-07-01T01:00:00.000Z" }]),
      clip: makeDataset([]),
      feed: makeDataset([]),
      // This dataset is deliberately small so the whole crawl ends quickly; the
      // point is the note position survives past the point where feed pages twice.
      feed_entry: makeDataset([
        { id: "f1", updatedAt: "2026-07-01T02:00:00.000Z" },
        { id: "f2", updatedAt: "2026-07-01T02:10:00.000Z" },
        { id: "f3", updatedAt: "2026-07-01T02:20:00.000Z" },
      ]),
    };

    const { seen, finalCursor } = await crawlAll(datasets, 2);
    expect(seen.length).toBe(4);
    const positions = decodePageCursor(finalCursor);
    expect(positions.note?.id).toBe("n1"); // note position retained even though it exhausted first
    expect(positions.feed_entry?.id).toBe("f3");
  });
});

describe("ZOO-104 · pagination helpers", () => {
  it("clamps page size to the accepted range", () => {
    expect(applyPageLimit()).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(0)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(-5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(1.5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(2)).toBe(2);
    expect(applyPageLimit(MAX_PAGE_LIMIT + 1)).toBe(MAX_PAGE_LIMIT);
  });

  it("normalizes a cursor to epoch", () => {
    expect(normalizeCursor(undefined).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizeCursor("not-a-date").toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// ZOO-108: contract version gate (real behavior)
// ---------------------------------------------------------------------------

describe("ZOO-108 · contract version gate", () => {
  it("accepts the current and older contract versions", () => {
    expect(contractVersionSupported()).toBe(true);
    expect(contractVersionSupported(1)).toBe(true);
    expect(contractVersionSupported(0)).toBe(true);
  });

  it("rejects future contract versions", () => {
    expect(contractVersionSupported(SYNC_CONTRACT_VERSION + 1)).toBe(false);
    expect(contractVersionSupported(99)).toBe(false);
  });

  it("exposes a stable unsupported-version error code", () => {
    expect(SYNC_ERROR_CONTRACT_UNSUPPORTED).toBe("contract_version_unsupported");
  });
});

// ---------------------------------------------------------------------------
// ZOO-107: atomic CAS behavior (mock store, no expected-JSON self-assert)
// ---------------------------------------------------------------------------

/** In-memory mock of a row store whose updateMany respects the WHERE clause. */
function makeMockStore(initial: { id: string; version: number; deletedAt: Date | null }) {
  let state = { ...initial };
  return {
    read() {
      return { ...state };
    },
    readCurrent: async (): Promise<CasRow | null> => ({ ...state }),
    write: async (where: Record<string, unknown>): Promise<{ count: number }> => {
      // Simulate the atomic WHERE: version equality + deletedAt null, like Prisma.
      const versionOk = where.version === undefined || where.version === state.version;
      const alive = where.deletedAt === null && state.deletedAt === null;
      if (versionOk && alive) {
        state = { ...state, version: state.version + 1 };
        return { count: 1 };
      }
      return { count: 0 };
    },
  };
}

describe("ZOO-107 · atomic CAS (two writers with the same expectedVersion)", () => {
  it("allows exactly one concurrent write to succeed", async () => {
    const store = makeMockStore({ id: "note-1", version: 3, deletedAt: null });

    // Both clients read version 3 and try to write with expectedVersion 3.
    const a: CasOutcome = await casUpdate({
      expectedVersion: 3,
      readCurrent: store.readCurrent,
      write: store.write,
    });
    const b: CasOutcome = await casUpdate({
      expectedVersion: 3,
      readCurrent: store.readCurrent,
      write: store.write,
    });

    const winners = [a, b].filter((o) => o.applied).length;
    expect(winners).toBe(1); // never 0 or 2
    const loser = [a, b].find((o) => !o.applied && o.reason === "conflict");
    expect(loser !== undefined).toBe(true);
    expect(store.read().version).toBe(4);
  });

  it("returns version_conflict with the current record for the stale writer", async () => {
    const store = makeMockStore({ id: "note-1", version: 5, deletedAt: null });
    const outcome = await casUpdate({
      expectedVersion: 3,
      readCurrent: store.readCurrent,
      write: store.write,
    });
    expect(outcome).toEqual({ applied: false, reason: "conflict", current: { id: "note-1", version: 5, deletedAt: null } });
    expect(store.read().version).toBe(5); // no write occurred
  });

  it("reports not_found when the row is gone or soft-deleted (never a false conflict)", async () => {
    const deleted = makeMockStore({ id: "note-x", version: 9, deletedAt: new Date("2026-07-01T00:00:00.000Z") });
    const gone: CasOutcome = await casUpdate({
      expectedVersion: 9,
      readCurrent: async () => null,
      write: deleted.write,
    });
    expect(gone).toEqual({ applied: false, reason: "not_found" });
  });

  it("legacy path (no expectedVersion) applies unconditionally like before", async () => {
    const store = makeMockStore({ id: "note-1", version: 2, deletedAt: null });
    const outcome = await casUpdate({
      readCurrent: store.readCurrent,
      write: store.write,
    });
    expect(outcome.applied).toBe(true);
    expect(store.read().version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Fixtures still validate the envelope shapes and documented semantics.
// ---------------------------------------------------------------------------

describe("sync protocol · envelopes & fixture shapes", () => {
  it("uses stable entity names", () => {
    expect(syncEntities).toEqual(["note", "clip", "feed", "feed_entry"]);
  });

  it("accepts pull/push requests without contractVersion (defaults to 1)", () => {
    expect(syncPullSchema.parse({ cursor: "2026-07-03T00:00:00.000Z" }).contractVersion).toBeUndefined();
    expect(syncPushSchema.parse({ mutations: [{ entity: "note", op: "update", id: "n", data: {} }] }).mutations.length).toBe(1);
  });

  it("accepts composite cursor strings in the pull schema", () => {
    const composite = encodePageCursor({ note: { updatedAt: "2026-07-03T00:00:00.000Z", id: "n1" } })!;
    expect(syncPullSchema.parse({ cursor: composite }).cursor).toBe(composite);
  });

  it("exposes stable page limits and empty records", () => {
    expect(DEFAULT_PAGE_LIMIT).toBeGreaterThan(0);
    expect(MAX_PAGE_LIMIT).toBeGreaterThanOrEqual(DEFAULT_PAGE_LIMIT);
    const empty = createEmptyRecords<SyncRecord>();
    for (const entity of syncEntities) expect(empty[entity]).toEqual([]);
  });
});

describe("sync protocol · fixture files conform to the live contract schemas", () => {
  it("every fixture request parses through the pull/push schemas", () => {
    const fixtures = {
      "pull-requests": [
        JSON.parse(readJson("pull-incremental")).requestEmpty,
        JSON.parse(readJson("pull-pagination")).requestPage1,
        JSON.parse(readJson("pull-pagination")).requestPage2,
        JSON.parse(readJson("pull-tombstones")).request,
      ],
      "push-requests": [
        JSON.parse(readJson("push-create-idempotent")).firstPush,
        JSON.parse(readJson("push-create-idempotent")).secondPush,
        JSON.parse(readJson("push-update-conflict")).stalePush,
        JSON.parse(readJson("push-update-conflict")).freshPush,
        JSON.parse(readJson("push-mutations-composite")).request,
        JSON.parse(readJson("push-errors")).request,
      ],
    };
    for (const pull of fixtures["pull-requests"]) expect(syncPullSchema.parse(pull)).toBeDefined();
    for (const push of fixtures["push-requests"]) expect(syncPushSchema.parse(push)).toBeDefined();
    expect(fixtures["pull-requests"].length).toBe(4);
    expect(fixtures["push-requests"].length).toBe(6);
  });

  it("records encoded in fixtures expose the stable per-entity keyed shape", () => {
    const pull = JSON.parse(readJson("pull-incremental")).expectedResponse;
    expect(typeof pull.cursor).toBe("string");
    expect(typeof pull.nextCursor).toBe("string");
    expect(pull.cursor.startsWith("mewmo-sync-v1:")).toBe(true);
    expect(pull.hasMore).toBe(false);
    for (const entity of syncEntities) expect(Array.isArray(pull.records[entity])).toBe(true);
  });
});
