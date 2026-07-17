import { describe, expect, it, vi } from "vitest";

import { createServerTiming } from "../../apps/web/src/lib/server-timing";

describe("createServerTiming", () => {
  it("emits stable auth db and total metrics", async () => {
    const now = vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(8)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(17)
      .mockReturnValueOnce(20);

    const timing = createServerTiming();
    await timing.measure("auth", async () => "user-1");
    await timing.measure("db", async () => []);

    expect(timing.header()).toBe("auth;dur=3.0, db;dur=7.0, total;dur=20.0");
    now.mockRestore();
  });
});
