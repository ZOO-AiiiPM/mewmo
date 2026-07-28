import type { Adapter } from "next-auth/adapters";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthConfig,
  DUMMY_PASSWORD_HASH,
  type CreateAuthConfigOptions,
} from "../../packages/auth/src/auth";
import { getClientIp, LoginRateLimitError } from "../../packages/auth/src/login-rate-limit";

const testEnv = {
  DATABASE_URL: "postgresql://mewmo:mewmo@localhost:5432/mewmo_test",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "secret",
  NEXTAUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  OPENAI_API_KEY: "openai",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_ACCESS_KEY: "access",
  R2_SECRET_KEY: "secret",
  R2_BUCKET: "mewmo-test",
  R2_PUBLIC_BASE_URL: "https://cdn.mewmo.test",
  RESEND_API_KEY: "resend",
  EMAIL_FROM: "Mewmo <login@mewmo.test>",
};

interface TestUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  password: string | null;
}

function setup({ user = null, locked = false }: { user?: TestUser | null; locked?: boolean } = {}) {
  const findUnique = vi.fn(async () => user);
  const limiter = {
    isLocked: vi.fn(async () => locked),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const comparePassword = vi.fn(async (password: string, hash: string) => hash === `hash:${password}`);

  const config = createAuthConfig({
    env: testEnv,
    adapter: {} as Adapter,
    ensureAccountOnboarding: async () => undefined,
    prisma: { user: { findUnique } } as unknown as CreateAuthConfigOptions["prisma"],
    loginRateLimiter: limiter,
    comparePassword,
  });

  // Credentials(config) 不展开用户配置，真正的 authorize 挂在 provider.options 上
  const credentialsProvider = config.providers[0] as unknown as {
    options: {
      authorize: (credentials: Record<string, unknown>, request: Request) => Promise<unknown>;
    };
  };

  return { authorize: credentialsProvider.options.authorize, findUnique, limiter, comparePassword };
}

function makeRequest(headers: Record<string, string> = { "x-forwarded-for": "9.9.9.9, 10.0.0.1" }) {
  return new Request("http://localhost/api/auth/callback/credentials", { method: "POST", headers });
}

describe("credentials authorize", () => {
  it("rejects locked email+ip pairs before touching the database", async () => {
    const { authorize, findUnique, limiter } = setup({ locked: true });

    await expect(
      authorize({ email: "a@b.com", password: "pw" }, makeRequest()),
    ).rejects.toBeInstanceOf(LoginRateLimitError);

    expect(limiter.isLocked).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("runs a dummy compare and records a failure for unknown emails", async () => {
    const { authorize, limiter, comparePassword } = setup({ user: null });

    await expect(authorize({ email: "a@b.com", password: "pw" }, makeRequest())).resolves.toBeNull();

    expect(comparePassword).toHaveBeenCalledWith("pw", DUMMY_PASSWORD_HASH);
    expect(limiter.recordFailure).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
    expect(limiter.clear).not.toHaveBeenCalled();
  });

  it("treats oauth-only users (no password hash) like unknown emails", async () => {
    const user: TestUser = { id: "u1", email: "a@b.com", name: null, image: null, password: null };
    const { authorize, limiter, comparePassword } = setup({ user });

    await expect(authorize({ email: "a@b.com", password: "pw" }, makeRequest())).resolves.toBeNull();

    expect(comparePassword).toHaveBeenCalledWith("pw", DUMMY_PASSWORD_HASH);
    expect(limiter.recordFailure).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
  });

  it("records a failure for a wrong password", async () => {
    const user: TestUser = { id: "u1", email: "a@b.com", name: null, image: null, password: "hash:right" };
    const { authorize, limiter, comparePassword } = setup({ user });

    await expect(authorize({ email: "a@b.com", password: "wrong" }, makeRequest())).resolves.toBeNull();

    expect(comparePassword).toHaveBeenCalledWith("wrong", "hash:right");
    expect(limiter.recordFailure).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
    expect(limiter.clear).not.toHaveBeenCalled();
  });

  it("clears the counter and returns the user on success", async () => {
    const user: TestUser = { id: "u1", email: "a@b.com", name: "A", image: null, password: "hash:right" };
    const { authorize, limiter } = setup({ user });

    await expect(authorize({ email: "a@b.com", password: "right" }, makeRequest())).resolves.toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      image: null,
    });

    expect(limiter.clear).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
    expect(limiter.recordFailure).not.toHaveBeenCalled();
  });

  it("returns null for missing or non-string credentials without hitting limiter or db", async () => {
    const { authorize, findUnique, limiter } = setup();

    await expect(authorize({ email: "a@b.com" }, makeRequest())).resolves.toBeNull();
    await expect(authorize({ email: 1, password: "pw" }, makeRequest())).resolves.toBeNull();

    expect(findUnique).not.toHaveBeenCalled();
    expect(limiter.isLocked).not.toHaveBeenCalled();
    expect(limiter.recordFailure).not.toHaveBeenCalled();
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(getClientIp(makeRequest({ "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(getClientIp(makeRequest({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(getClientIp(makeRequest({}))).toBe("unknown");
    expect(getClientIp(undefined)).toBe("unknown");
  });
});
