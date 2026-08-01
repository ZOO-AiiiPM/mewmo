import { describe, expect, it } from "vitest";

import { shouldBlockStopFollowupSubmit } from "./stop-pointer-guard";

describe("ChatInput stop pointer guard", () => {
  it("blocks a pointer submit from the stop button replacement window", () => {
    expect(shouldBlockStopFollowupSubmit(1_500, 1_200, { detail: 1 })).toBe(true);
  });

  it("allows keyboard submit and a later deliberate pointer submit", () => {
    expect(shouldBlockStopFollowupSubmit(1_500, 1_200, { detail: 0 })).toBe(false);
    expect(shouldBlockStopFollowupSubmit(1_500, 1_501, { detail: 1 })).toBe(false);
  });
});
