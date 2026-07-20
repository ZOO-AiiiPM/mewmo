import { describe, expect, it } from "vitest";

import { loadFeedIngestionEnv } from "./env";

describe("Feed Ingestion environment entrypoint", () => {
  it("requires only the database connection", () => {
    const env = loadFeedIngestionEnv({
      DATABASE_URL: "postgresql://db.example/mewmo",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("does not require Redis or model credentials", () => {
    expect(() => loadFeedIngestionEnv({ DATABASE_URL: "postgresql://db/mewmo" })).not.toThrow();
  });

  it("fails fast without a database connection", () => {
    expect(() => loadFeedIngestionEnv({})).toThrow("DATABASE_URL");
  });
});
