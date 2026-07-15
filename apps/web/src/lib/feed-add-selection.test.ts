import { describe, expect, it } from "vitest";

import { failedFeedUrls, feedAddOutcome, selectAllFeedUrls, toggleFeedUrl } from "./feed-add-selection";

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

  it("keeps queue failures retryable even when the Web fallback starts", () => {
    expect(feedAddOutcome({ existing: false, queued: false, backgroundStarted: true })).toBe("failed");
    expect(feedAddOutcome({ existing: true, queued: false, backgroundStarted: true })).toBe("failed");
    expect(feedAddOutcome({ existing: true, queued: false, backgroundStarted: false })).toBe("existing");
    expect(feedAddOutcome({ existing: false, queued: true, backgroundStarted: true })).toBe("added");
  });
});
