import { describe, expect, it } from "vitest";

import { findThemeColorViolations } from "../../tooling/check-theme-colors.mjs";

describe("theme color policy", () => {
  it("rejects fixed foreground colors in application UI", () => {
    const source = [
      "+  color: #fff;",
      "+  color: white;",
      '+  <span className="text-white">Name</span>',
      "+  color: rgb(255, 255, 255);",
    ].join("\n");

    expect(
      findThemeColorViolations("apps/web/src/components/Card.tsx", source, []),
    ).toHaveLength(4);
  });

  it("accepts semantic variables and reviewed exceptions", () => {
    expect(
      findThemeColorViolations(
        "apps/web/src/components/Card.tsx",
        "+  color: var(--ink);",
        [],
      ),
    ).toEqual([]);
    expect(
      findThemeColorViolations(
        "apps/web/src/app/(marketing)/page.tsx",
        '+  <span className="text-white">Brand</span>',
        [
          {
            path: "apps/web/src/app/(marketing)/page.tsx",
            pattern: 'className="text-white"',
            reason: "fixed brand artwork",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("rejects allowlist entries without a reason", () => {
    expect(() =>
      findThemeColorViolations(
        "apps/web/src/components/Card.tsx",
        "+  color: white;",
        [{ path: "apps/web/src/components/Card.tsx", pattern: "white", reason: "" }],
      ),
    ).toThrow(/reason/);
  });
});
