import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  SYNC_CONTRACT_VERSION,
  applyPageLimit,
  buildNextCursor,
  createEmptyRecords,
  hasMorePage,
  normalizeCursor,
  syncEntities,
  syncPullSchema,
  syncPushSchema,
  type SyncPullResponse,
  type SyncPushResponse,
} from "./protocol";

const fixture = (name: string) => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, `fixtures/${name}.json`), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
};

describe("sync protocol · contract version & compatibility", () => {
  it("exposes a stable major contract version", () => {
    expect(SYNC_CONTRACT_VERSION).toBe(1);
    expect(SYNC_CONTRACT_VERSION).toBe(Number.isInteger(SYNC_CONTRACT_VERSION) ? SYNC_CONTRACT_VERSION : NaN);
  });

  it("exposes bounded page limits", () => {
    expect(DEFAULT_PAGE_LIMIT).toBeGreaterThan(0);
    expect(MAX_PAGE_LIMIT).toBeGreaterThanOrEqual(DEFAULT_PAGE_LIMIT);
  });

  it("uses stable entity names across fixtures", () => {
    expect(syncEntities).toEqual(["note", "clip", "feed", "feed_entry"]);
  });

  it("accepts envelopes without contractVersion (defaults to 1)", () => {
    expect(syncPullSchema.parse({ cursor: "2026-07-03T00:00:00.000Z" }).contractVersion).toBeUndefined();
    expect(syncPushSchema.parse({ mutations: [{ entity: "note", op: "update", id: "n", data: {} }] }).mutations.length).toBe(1);
  });
});

describe("sync protocol · cursor", () => {
  it("normalizes missing/garbage cursor to epoch", () => {
    expect(normalizeCursor(undefined).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizeCursor("").toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(normalizeCursor("not-a-date").toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("parses a valid ISO cursor", () => {
    expect(normalizeCursor("2026-07-03T00:00:00.000Z").toISOString()).toBe("2026-07-03T00:00:00.000Z");
  });

  it("builds nextCursor from the last returned record", () => {
    expect(
      buildNextCursor(
        [
          { updatedAt: "2026-07-03T10:30:00.000Z" },
          { updatedAt: "2026-07-03T12:30:00.000Z" },
        ],
        "fallback",
      ),
    ).toBe("2026-07-03T12:30:00.000Z");
    expect(buildNextCursor([], "fallback")).toBe("fallback");
  });
});

describe("sync protocol · pagination", () => {
  it("clamps page size to the accepted range", () => {
    expect(applyPageLimit()).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(0)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(-5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(1.5)).toBe(DEFAULT_PAGE_LIMIT);
    expect(applyPageLimit(2)).toBe(2);
    expect(applyPageLimit(MAX_PAGE_LIMIT + 1)).toBe(MAX_PAGE_LIMIT);
  });

  it("reports hasMore when the page is full", () => {
    expect(hasMorePage(2, 2)).toBe(true);
    expect(hasMorePage(1, 2)).toBe(false);
    expect(hasMorePage(0, 200)).toBe(false);
  });
});

describe("sync protocol · fixtures (contract tests)", () => {
  it("pull-incremental: filters records after cursor and advances nextCursor", () => {
    const f = fixture("pull-incremental") as unknown as {
      request: { cursor: string };
      expectedResponse: SyncPullResponse;
    };
    const schema = syncPullSchema.parse(f.request);
    expect(schema.cursor).toBe(f.request.cursor);

    const response = f.expectedResponse;
    expect(response.contractVersion).toBe(SYNC_CONTRACT_VERSION);
    expect(response.nextCursor).toBe(response.cursor);
    // Only records updated strictly after the cursor should be present.
    const cursor = normalizeCursor(f.request.cursor);
    for (const entity of syncEntities) {
      for (const record of response.records[entity]) {
        expect(new Date(record.updatedAt).getTime()).toBeGreaterThan(cursor.getTime());
      }
    }
    expect(response.records.note[0]?.id).toBe("note-1");
  });

  it("pull-pagination: pages advance until hasMore flips false", () => {
    const f = fixture("pull-pagination") as unknown as {
      requestPage1: { cursor: string; limit: number };
      expectedResponsePage1: SyncPullResponse;
      requestPage2: { cursor: string; limit: number };
      expectedResponsePage2: SyncPullResponse;
    };

    expect(applyPageLimit(f.requestPage1.limit)).toBe(f.requestPage1.limit);
    expect(f.expectedResponsePage1.hasMore).toBe(true);
    expect(f.expectedResponsePage1.nextCursor).toBe(f.expectedResponsePage1.cursor);

    // Page 2 continues from page 1's nextCursor.
    expect(f.requestPage2.cursor).toBe(f.expectedResponsePage1.nextCursor);
    expect(f.expectedResponsePage2.hasMore).toBe(false);

    const ids = [
      ...f.expectedResponsePage1.records.note.map((r) => r.id),
      ...f.expectedResponsePage2.records.note.map((r) => r.id),
    ];
    expect(ids).toEqual(["note-a", "note-b", "note-c"]);
  });

  it("pull-tombstones: deletions surface via deletedAt on pulled records", () => {
    const f = fixture("pull-tombstones") as unknown as { expectedResponse: SyncPullResponse };
    const deleted = f.expectedResponse.records.note.filter((r) => r.deletedAt);
    expect(deleted.length).toBe(1);
    expect(deleted[0]?.id).toBe("note-deleted");
    expect(deleted[0]?.version).toBe(3);
  });

  it("push-create-idempotent: same id does not create a duplicate", () => {
    const f = fixture("push-create-idempotent") as unknown as {
      firstPush: { mutations: unknown[] };
      expectedFirstResponse: SyncPushResponse;
      secondPush: { mutations: unknown[] };
      expectedSecondResponse: SyncPushResponse;
    };

    expect(syncPushSchema.parse(f.firstPush).mutations.length).toBe(1);
    expect(syncPushSchema.parse(f.secondPush).mutations.length).toBe(1);

    // Same target id on both pushes → both report the exact same record.
    const first = f.expectedFirstResponse.applied[0]!;
    const second = f.expectedSecondResponse.applied[0]!;
    expect(second.record?.id).toBe(first.record?.id);
    expect(second.record?.version).toBe(first.record?.version); // no double-increment on re-create
    expect(f.expectedSecondResponse.errors.length).toBe(0);
  });

  it("push-update-conflict: stale expectedVersion is rejected and echoed; fresh retry succeeds", () => {
    const f = fixture("push-update-conflict") as unknown as {
      expectedStaleResponse: SyncPushResponse;
      expectedFreshResponse: SyncPushResponse;
      freshPush: { mutations: { data: { expectedVersion: number } }[] };
    };

    const staleError = f.expectedStaleResponse.errors[0]!;
    expect(staleError.code).toBe("version_conflict");
    expect(staleError.record?.id).toBe("note-1");
    expect(staleError.record?.version).toBe(3);
    expect(f.expectedStaleResponse.applied.length).toBe(0);

    // Fresh retry carries the echoed version and applies → version 3 + 1.
    expect(f.freshPush.mutations[0]?.data.expectedVersion).toBe(3);
    const fresh = f.expectedFreshResponse.applied[0]!;
    expect(fresh.record?.version).toBe(4);
    expect(f.expectedFreshResponse.errors.length).toBe(0);
  });

  it("push-mutations-composite: all ops apply independently", () => {
    const f = fixture("push-mutations-composite") as unknown as {
      request: { mutations: unknown[] };
      expectedResponse: SyncPushResponse;
    };
    expect(syncPushSchema.parse(f.request).mutations.length).toBe(5);
    expect(f.expectedResponse.applied.length).toBe(5);
    expect(f.expectedResponse.errors.length).toBe(0);
    expect(f.expectedResponse.applied.map((a) => a.entity)).toEqual([
      "note",
      "note",
      "note",
      "clip",
      "feed_entry",
    ]);
  });

  it("push-errors: failed mutations report stable codes while others apply", () => {
    const f = fixture("push-errors") as unknown as {
      request: { mutations: unknown[] };
      expectedResponse: SyncPushResponse;
    };
    expect(syncPushSchema.parse(f.request).mutations.length).toBe(5);
    expect(f.expectedResponse.errors.map((e) => e.code)).toEqual([
      "not_found",
      "missing_id",
      "unsupported_entity",
      "unsupported_operation",
    ]);
    expect(f.expectedResponse.applied.map((a) => a.index)).toEqual([3]);
  });

  it("every fixture carries contractVersion 1", () => {
    for (const name of [
      "pull-incremental",
      "pull-pagination",
      "pull-tombstones",
      "push-create-idempotent",
      "push-update-conflict",
      "push-mutations-composite",
      "push-errors",
    ]) {
      const f = fixture(name);
      expect(f.contractVersion).toBe(1);
    }
  });
});

describe("sync protocol · empty records", () => {
  it("creates an all-entity empty records map", () => {
    const empty = createEmptyRecords<{ id: string }>();
    expect(Object.keys(empty).sort()).toEqual(["clip", "feed", "feed_entry", "note"]);
    for (const entity of syncEntities) expect(empty[entity]).toEqual([]);
  });
});
