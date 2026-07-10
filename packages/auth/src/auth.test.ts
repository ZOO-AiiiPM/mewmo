import { describe, expect, it, vi } from "vitest";
import type { Adapter } from "next-auth/adapters";

import { createAuthConfig, protectedRouteMatcher } from "./auth";

const env = {
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

describe("auth config", () => {
  it("configures credentials, magic-link email, and Google providers", () => {
    const config = createAuthConfig({ env, adapter: {} as Adapter });
    const providers = config.providers as Array<{ id: string }>;

    expect(providers.map((provider) => provider.id)).toEqual(["credentials", "resend", "google"]);
  });

  it("protects app routes", () => {
    expect(protectedRouteMatcher).toEqual(["/app/:path*"]);
  });

  it("initializes onboarding notes when an adapter creates a user", async () => {
    const ensureAccountOnboarding = vi.fn().mockResolvedValue({ existing: 0, created: 3 });
    const config = createAuthConfig({
      env,
      adapter: {} as Adapter,
      ensureAccountOnboarding,
    });

    await config.events?.createUser?.({
      user: { id: "user-1", email: "new@mewmo.app", emailVerified: null },
    });

    expect(ensureAccountOnboarding).toHaveBeenCalledWith("user-1");
  });

  it("ignores incomplete createUser events without an account id", async () => {
    const ensureAccountOnboarding = vi.fn();
    const config = createAuthConfig({
      env,
      adapter: {} as Adapter,
      ensureAccountOnboarding,
    });

    await config.events?.createUser?.({
      user: { email: "new@mewmo.app", emailVerified: null },
    });

    expect(ensureAccountOnboarding).not.toHaveBeenCalled();
  });
});
