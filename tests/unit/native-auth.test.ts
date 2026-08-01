import { describe, expect, it, vi } from "vitest";

import { createNativeAuthService } from "../../apps/web/src/lib/native-auth";

const SECRET = "test-native-secret";
const DUMMY_USER = {
  id: "user-1",
  email: "a@b.com",
  name: "A",
  password: "hash:right",
};

interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  platform: string;
  deviceName: string | null;
  revokedAt: Date | null;
  refreshExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  lastIp: string | null;
  lastUserAgent: string | null;
}

function makeRequest(headers: Record<string, string> = { "x-forwarded-for": "9.9.9.9" }) {
  return new Request("http://localhost/api/auth/native/login", { method: "POST", headers });
}

interface Harness {
  service: ReturnType<typeof createNativeAuthService>;
  prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    nativeSession: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  limiter: {
    isLocked: ReturnType<typeof vi.fn>;
    recordFailure: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

function setup({
  user = DUMMY_USER,
  locked = false,
}: { user?: typeof DUMMY_USER | null; locked?: boolean } = {}): Harness {
  const store: SessionRow[] = [];

  const nativeSession = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const data = args.data as unknown as SessionRow;
      const row: SessionRow = {
        id: `sess-${store.length + 1}`,
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        deviceId: data.deviceId,
        platform: data.platform,
        deviceName: (data.deviceName as string | null) ?? null,
        revokedAt: null,
        refreshExpiresAt: data.refreshExpiresAt as Date,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        lastIp: (data.lastIp as string | null) ?? null,
        lastUserAgent: (data.lastUserAgent as string | null) ?? null,
      };
      store.push(row);
      return row;
    }),

    findUnique: vi.fn(async ({ where }: { where: { id?: string; refreshTokenHash?: string } }) => {
      if (where.id !== undefined) return store.find((s) => s.id === where.id) ?? null;
      if (where.refreshTokenHash !== undefined)
        return store.find((s) => s.refreshTokenHash === where.refreshTokenHash) ?? null;
      return null;
    }),

    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const idx = store.findIndex((s) => s.id === where.id);
      if (idx < 0) throw new Error("missing row");
      const row = store[idx]!;
      const merged = { ...row, ...data } as SessionRow;
      store[idx] = merged;
      return merged;
    }),
  };

  const prisma = { user: { findUnique: vi.fn(async () => user) }, nativeSession };
  const limiter = {
    isLocked: vi.fn(async () => locked),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const comparePassword = vi.fn(async (password: string, hash: string) => hash === `hash:${password}`);

  const service = createNativeAuthService({
    prisma: prisma as never,
    secret: SECRET,
    rateLimiter: limiter,
    comparePassword,
    now: () => new Date("2026-08-01T08:00:00.000Z"),
  });

  return { service, prisma, limiter };
}

describe("native login", () => {
  it("returns short-lived access + long-lived rotatable refresh and clears the limiter", async () => {
    const { service, limiter } = setup();

    const result = await service.login({ email: "a@b.com", password: "right" }, makeRequest());

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBeTruthy();
    expect(result!.refreshToken).toBeTruthy();
    expect(result!.expiresIn).toBe(15 * 60);
    expect(result!.refreshExpiresIn).toBe(30 * 24 * 60 * 60);
    expect(result!.sessionId).toBeTruthy();
    expect(result!.user.id).toBe("user-1");
    expect(limiter.clear).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
  });

  it("returns null for unknown emails after a dummy timing compare and records failure", async () => {
    const { service, limiter, prisma } = setup({ user: null });

    const result = await service.login({ email: "nobody@b.com", password: "pw" }, makeRequest());

    expect(result).toBeNull();
    expect(limiter.recordFailure).toHaveBeenCalled();
    expect(limiter.clear).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "nobody@b.com" } });
  });

  it("returns null and records failure for a wrong password", async () => {
    const { service, limiter } = setup();

    const result = await service.login({ email: "a@b.com", password: "wrong" }, makeRequest());

    expect(result).toBeNull();
    expect(limiter.recordFailure).toHaveBeenCalled();
  });

  it("throws a rate-limited error before touching the user lookup when locked", async () => {
    const { service, prisma } = setup({ locked: true });

    await expect(service.login({ email: "a@b.com", password: "right" }, makeRequest())).rejects.toMatchObject({
      status: 429,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("compares as lowercase trimmed email for lookup and limiter keys", async () => {
    const { service, prisma, limiter } = setup();

    await service.login({ email: "  A@B.com ", password: "right" }, makeRequest());

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "a@b.com" } });
    expect(limiter.clear).toHaveBeenCalledWith("a@b.com", "9.9.9.9");
  });
});

describe("native refresh rotation", () => {
  it("returns a new access and rotates the refresh token, invalidating the old one", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;
    const oldRefresh = login.refreshToken;

    const refreshed = await service.refresh(oldRefresh, makeRequest());
    expect(refreshed.sessionId).toBe(login.sessionId);
    expect(refreshed.refreshToken).not.toBe(oldRefresh);
    expect(refreshed.accessToken).toBeTruthy();

    // 旧 refresh 已轮换 → 再次使用应 401
    await expect(service.refresh(oldRefresh, makeRequest())).rejects.toMatchObject({ status: 401 });
    // 新 refresh 有效
    await expect(service.refresh(refreshed.refreshToken, makeRequest())).resolves.toMatchObject({
      sessionId: login.sessionId,
    });
  });

  it("rejects refresh tokens that were revoked by logout", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    await service.revokeByRefreshToken(login.refreshToken);
    await expect(service.refresh(login.refreshToken, makeRequest())).rejects.toMatchObject({ status: 401 });
    await expect(service.revokeByRefreshToken(login.refreshToken)).resolves.toBeUndefined();
  });

  it("rejects unknown or malformed refresh tokens", async () => {
    const { service } = setup();
    await expect(service.refresh("does-not-exist", makeRequest())).rejects.toMatchObject({ status: 401 });
    await expect(service.refresh("", makeRequest())).rejects.toMatchObject({ status: 401 });
    await expect(service.refresh("short", makeRequest())).rejects.toMatchObject({ status: 401 });
  });
});

describe("native logout", () => {
  it("revokes the session so the access token stops resolving", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    // bearer 注销
    await service.revokeSession(login.sessionId);
    expect(await service.resolveAccessToken(login.accessToken)).toBeNull();
  });

  it("resolveAccessToken validates ownership claims from the signed token", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    const identity = await service.resolveAccessToken(login.accessToken);
    expect(identity).toMatchObject({ userId: "user-1", sessionId: login.sessionId });
    expect(await service.resolveAccessToken("garbage")).toBeNull();
    expect(await service.resolveAccessToken("")).toBeNull();
  });
});

describe("request-user resolution (bearer or cookie)", () => {
  it("resolves a valid native bearer token to its user for ownership scoping", async () => {
    const { service, prisma } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    // 用一个持有相同 secret + 同一 mock 存储的独立 service 从路由侧解析
    const router = createNativeAuthService({ secret: SECRET, prisma: prisma as never });
    const req = new Request("http://localhost/api/sync/pull", {
      method: "POST",
      headers: { authorization: `Bearer ${login.accessToken}` },
      body: JSON.stringify({ cursor: null }),
    });

    expect(await router.resolveAccessToken(login.accessToken)).toEqual({
      userId: "user-1",
      sessionId: login.sessionId,
      kind: "native_access",
      scope: "native",
    });
    expect(req.headers.get("authorization")).toContain("Bearer ");
  });

  it("returns null for an invalid/nonexistent bearer token", async () => {
    const { prisma } = setup();
    const router = createNativeAuthService({ secret: SECRET, prisma: prisma as never });
    expect(await router.resolveAccessToken("not-valid")).toBeNull();
  });
});
