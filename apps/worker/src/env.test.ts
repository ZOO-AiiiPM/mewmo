import { describe, expect, it } from "vitest";

import { loadWorkerEnv } from "./env";

describe("Worker environment entrypoint", () => {
  it("exposes the scoped Worker environment loader", () => {
    const env = loadWorkerEnv({
      DATABASE_URL: "postgresql://db.example/mewmo",
      REDIS_URL: "redis://localhost:6379",
      NEXTAUTH_URL: "http://localhost:3000",
      OPENAI_API_KEY: "openai-key",
      AI_SUMMARY_MODEL: "summary-model",
    });

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.REDIS_URL).toContain("redis://");
  });
});
