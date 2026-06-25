import { describe, expect, it } from "vitest";

import { loadEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://mewmo:mewmo@localhost:5432/mewmo_dev",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "secret",
  NEXTAUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_ACCESS_KEY: "access",
  R2_SECRET_KEY: "secret",
  R2_BUCKET: "mewmo-dev",
  R2_PUBLIC_BASE_URL: "https://cdn.mewmo.test",
  RESEND_API_KEY: "resend",
  EMAIL_FROM: "Mewmo <login@mewmo.app>",
};

describe("loadEnv", () => {
  it("returns validated env values", () => {
    const env = loadEnv(validEnv);

    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.R2_BUCKET).toBe("mewmo-dev");
    expect(env.R2_PUBLIC_BASE_URL).toBe("https://cdn.mewmo.test");
  });

  it("throws when required env values are missing", () => {
    expect(() => loadEnv({})).toThrow("Invalid environment");
  });
});
