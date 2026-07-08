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

  it("returns Qiniu storage env values when configured", () => {
    const env = loadEnv({
      ...validEnv,
      STORAGE_PROVIDER: "qiniu",
      QINIU_ACCESS_KEY: "qiniu-access",
      QINIU_SECRET_KEY: "qiniu-secret",
      QINIU_BUCKET: "mewmo-images",
      QINIU_PUBLIC_BASE_URL: "http://cdn.example.test",
      QINIU_UPLOAD_ENDPOINT: "https://upload-z2.qiniup.com",
    });

    expect(env.STORAGE_PROVIDER).toBe("qiniu");
    expect(env.QINIU_BUCKET).toBe("mewmo-images");
    expect(env.QINIU_PUBLIC_BASE_URL).toBe("http://cdn.example.test");
  });

  it("does not require R2 env values when Qiniu is configured", () => {
    const envWithoutR2: Partial<typeof validEnv> = { ...validEnv };
    delete envWithoutR2.R2_ENDPOINT;
    delete envWithoutR2.R2_ACCESS_KEY;
    delete envWithoutR2.R2_SECRET_KEY;
    delete envWithoutR2.R2_BUCKET;
    delete envWithoutR2.R2_PUBLIC_BASE_URL;

    const env = loadEnv({
      ...envWithoutR2,
      STORAGE_PROVIDER: "qiniu",
      QINIU_ACCESS_KEY: "qiniu-access",
      QINIU_SECRET_KEY: "qiniu-secret",
      QINIU_BUCKET: "mewmo-images",
      QINIU_PUBLIC_BASE_URL: "http://cdn.example.test",
    });

    expect(env.STORAGE_PROVIDER).toBe("qiniu");
    expect(env.R2_BUCKET).toBeUndefined();
  });

  it("does not require provider-specific AI keys for inactive providers", () => {
    const envWithoutInactiveAIKeys: Partial<typeof validEnv> = { ...validEnv };
    delete envWithoutInactiveAIKeys.OPENAI_API_KEY;
    delete envWithoutInactiveAIKeys.ANTHROPIC_API_KEY;

    const env = loadEnv({
      ...envWithoutInactiveAIKeys,
      AI_PROVIDER: "custom",
      CUSTOM_AI_API_KEY: "custom-key",
      CUSTOM_AI_BASE_URL: "https://custom.example/v1",
    });

    expect(env.AI_PROVIDER).toBe("custom");
    expect(env.CUSTOM_AI_API_KEY).toBe("custom-key");
  });

  it("throws when required env values are missing", () => {
    expect(() => loadEnv({})).toThrow("Invalid environment");
  });
});
