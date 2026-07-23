import { describe, expect, it } from "vitest";

import { generateOtpCode, safeEqualString } from "./otp-code";

describe("otp-code", () => {
  it("generates a 6-digit zero-padded code", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(0);
      expect(Number(code)).toBeLessThan(1_000_000);
    }
  });

  it("safeEqualString is true for equal strings", () => {
    expect(safeEqualString("482913", "482913")).toBe(true);
  });

  it("safeEqualString is false for different strings", () => {
    expect(safeEqualString("482913", "482914")).toBe(false);
  });

  it("safeEqualString is false for different lengths", () => {
    expect(safeEqualString("482913", "48291")).toBe(false);
  });
});
