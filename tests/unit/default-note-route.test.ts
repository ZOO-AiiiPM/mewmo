import { describe, expect, it } from "vitest";

import { getDefaultNoteRoute } from "../../apps/web/src/lib/default-note-route";

describe("default note route", () => {
  it("opens the first visible note after notes load", () => {
    expect(
      getDefaultNoteRoute({
        loading: false,
        query: "",
        notes: [{ slug: "first" }, { slug: "second" }],
      }),
    ).toBe("/notes/first");
  });

  it("does not redirect while loading, empty, or actively searching", () => {
    expect(
      getDefaultNoteRoute({
        loading: true,
        query: "",
        notes: [{ slug: "first" }],
      }),
    ).toBeNull();
    expect(getDefaultNoteRoute({ loading: false, query: "", notes: [] })).toBeNull();
    expect(
      getDefaultNoteRoute({
        loading: false,
        query: "test",
        notes: [{ slug: "first" }],
      }),
    ).toBeNull();
  });
});
