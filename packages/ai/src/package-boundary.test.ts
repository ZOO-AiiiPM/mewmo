import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("AI package boundary", () => {
  it("does not depend on database or application packages", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies ?? {}).not.toHaveProperty("@mewmo/db");
    expect(packageJson.dependencies ?? {}).not.toHaveProperty("@mewmo/shared");
  });
});
