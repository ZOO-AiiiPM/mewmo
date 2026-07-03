import { describe, expect, it } from "vitest";

import { normalizeCursor, syncEntities } from "./protocol";

describe("sync protocol", () => {
  it("uses stable entity names", () => {
    expect(syncEntities).toEqual(["note", "clip", "feed", "feed_entry"]);
  });

  it("normalizes missing cursor to epoch", () => {
    expect(normalizeCursor(undefined).toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
});
