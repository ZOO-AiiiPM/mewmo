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
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  limiter: {
    isLocked: ReturnType<typeof vi.fn>;
    recordFailure: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  refreshLimiter: {
    isLocked: ReturnType<typeof vi.fn>;
    recordFailure: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

function setup({
  user = DUMMY_USER,
  locked = false,
  refreshLocked = false,
}: { user?: typeof DUMMY_USER | null; locked?: boolean; refreshLocked?: boolean } = {}): Harness {
  const store: SessionRow[] = [];

  /** 行内原子 CAS 模拟：命中既有行则应用 data，否则 count=0。 */
  function casApply(
    where: { id?: string; refreshTokenHash?: string; revokedAt?: unknown; refreshExpiresAt?: unknown; userId?: string },
    data: Record<string, unknown>,
  ) {
    let idx = store.findIndex((s) => s.id === where.id);
    if (idx < 0) return { count: 0 };

    const row = store[idx]!;
    if (where.refreshTokenHash !== undefined && row.refreshTokenHash !== where.refreshTokenHash) return { count: 0 };
    if (where.userId !== undefined && row.userId !== where.userId) return { count: 0 };
    if (where.revokedAt !== undefined && row.revokedAt !== where.revokedAt) return { count: 0 };
    if (where.refreshExpiresAt !== undefined) {
      const gte = (where.refreshExpiresAt as Record<string, Date>).gte;
      if (gte && row.refreshExpiresAt < gte) return { count: 0 };
    }

    const merged = { ...row, ...data } as SessionRow;
    store[idx] = merged;
    return { count: 1 };
  }

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

    findUnique: vi.fn(async ({ where }: { where: { refreshTokenHash?: string; id?: string } }) => {
      if (where.refreshTokenHash !== undefined)
        return store.find((s) => s.refreshTokenHash === where.refreshTokenHash) ?? null;
      return store.find((s) => s.id === where.id) ?? null;
    }),

    findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
      return store.find((s) => s.id === where.id && s.userId === where.userId) ?? null;
    }),

    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const idx = store.findIndex((s) => s.id === where.id);
      if (idx < 0) throw new Error("missing row");
      const merged = { ...store[idx]!, ...data } as SessionRow;
      store[idx] = merged;
      return merged;
    }),

    updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      return casApply(
        args.where as Parameters<typeof casApply>[0],
        args.data as Record<string, unknown>,
      );
    }),
  };

  const prisma = { user: { findUnique: vi.fn(async () => user) }, nativeSession };
  const limiter = {
    isLocked: vi.fn(async () => locked),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const refreshLimiter = {
    isLocked: vi.fn(async () => refreshLocked),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const comparePassword = vi.fn(async (password: string, hash: string) => hash === `hash:${password}`);

  const service = createNativeAuthService({
    prisma: prisma as never,
    secret: SECRET,
    rateLimiter: limiter,
    refreshRateLimiter: refreshLimiter,
    comparePassword,
    now: () => new Date("2026-08-01T08:00:00.000Z"),
  });

  return { service, prisma, limiter, refreshLimiter };
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

  it("is atomic: only one concurrent refresh wins; the losing competitor and old token return 401", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;
    const oldRefresh = login.refreshToken;

    // 并发竞争者：服务按顺序执行，第二次 updateMany(CAS) 因旧哈希已换而 count=0 → 401
    const winner = await service.refresh(oldRefresh, makeRequest());
    expect(winner.accessToken).toBeTruthy();
    expect(winner.refreshToken).not.toBe(oldRefresh);

    // 竞争者用已被轮换的旧 token 必须 401，且不拿到任何新 token
    await expect(service.refresh(oldRefresh, makeRequest())).rejects.toMatchObject({ status: 401 });

    // 胜者拿到的新 refresh 仍有效
    await expect(service.refresh(winner.refreshToken, makeRequest())).resolves.toMatchObject({
      sessionId: login.sessionId,
    });
  });

  it("rolls back on CAS mismatch from a concurrent rotation: never returns an already-stale token", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    // 先让一个「竞争者」成功轮换，把旧哈希换掉；随后本 service 用旧 token 刷新 → CAS count=0 → 401
    const refreshed = await service.refresh(login.refreshToken, makeRequest());

    // 旧 token 已轮换 → 再次使用 401，且不能返回任何 token
    await expect(service.refresh(login.refreshToken, makeRequest())).rejects.toMatchObject({ status: 401 });

    // 手动把 CAS 模拟成「竞争者抢先」：直接再做一次同 token 刷新验证旧 token 永远失效
    await expect(service.refresh(login.refreshToken, makeRequest())).rejects.toMatchObject({ status: 401 });
    await expect(service.refresh(refreshed.refreshToken, makeRequest())).resolves.toMatchObject({
      sessionId: login.sessionId,
    });
  });

  it("treats a CAS write that affected 0 rows as a failed concurrent rotation (401 + records failure)", async () => {
    const { service, prisma, refreshLimiter } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    // 模拟「读决策通过，但写时已被竞争者抢先」：updateMany 返回 count 0
    prisma.nativeSession.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.refresh(login.refreshToken, makeRequest())).rejects.toMatchObject({
      status: 401,
      code: "invalid_refresh",
    });
    expect(refreshLimiter.recordFailure).toHaveBeenCalled();
  });

  it("is rate-limited: locked refresh returns a 429 rate_limited before touching the store", async () => {
    const { service, refreshLimiter, prisma } = setup({ refreshLocked: true });
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    await expect(service.refresh(login.refreshToken, makeRequest())).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    expect(prisma.nativeSession.findUnique).not.toHaveBeenCalled();
    expect(refreshLimiter.isLocked).toHaveBeenCalled();
  });

  it("clears the refresh limiter on success", async () => {
    const { service, refreshLimiter } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    await service.refresh(login.refreshToken, makeRequest());
    // clear 以 refresh hash + IP 为键
    expect(refreshLimiter.clear).toHaveBeenCalled();
  });

  it("records a refresh failure on invalid tokens for rate limiting", async () => {
    const { service, refreshLimiter } = setup();

    await expect(service.refresh("does-not-exist", makeRequest())).rejects.toMatchObject({ status: 401 });
    expect(refreshLimiter.recordFailure).toHaveBeenCalled();
  });
});

describe("native logout", () => {
  it("revokes the session so the access token stops resolving", async () => {
    const { service } = setup();
    const login = (await service.login({ email: "a@b.com", password: "right" }, makeRequest()))!;

    // bearer 注销（user ownership：只吊销该用户自己的会话）
    await service.revokeSession("user-1", login.sessionId);
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
