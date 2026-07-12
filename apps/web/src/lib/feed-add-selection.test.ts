import { describe, expect, it } from "vitest";

import { failedFeedUrls, selectAllFeedUrls, toggleFeedUrl } from "./feed-add-selection";

describe("feed add selection", () => {
  it("toggles one URL without disturbing other selections", () => {
    expect(toggleFeedUrl(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleFeedUrl(["b"], "a")).toEqual(["b", "a"]);
  });

  it("selects every discovered URL once", () => {
    expect(selectAllFeedUrls([{ url: "a" }, { url: "a" }, { url: "b" }])).toEqual(["a", "b"]);
  });

  it("returns only failed URLs for a partial-result retry", () => {
    expect(
      failedFeedUrls({
        a: "added",
        b: "existing",
        c: "failed",
      }),
    ).toEqual(["c"]);
  });
});
