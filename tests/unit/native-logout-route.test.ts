import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../apps/web/src/app/api/auth/native/logout/route";
import { createNativeAuthService } from "../../apps/web/src/lib/native-auth";

const serviceMock = vi.hoisted(() => ({
  revokeByRefreshToken: vi.fn(),
  revokeSession: vi.fn(),
  resolveAccessToken: vi.fn(),
}));

vi.mock("../../apps/web/src/lib/native-auth", () => ({
  createNativeAuthService: () => serviceMock,
  NativeAuthError: class NativeAuthError extends Error {
    status = 401;
    code = "invalid_refresh";
  },
}));

/** 构建带可迭 body + 可选 bearer 的 logout 请求。 */
function logoutRequest(body: unknown, bearer?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request("http://localhost/api/auth/native/logout", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_REFRESH = "valid-refresh-token-00000000000000";
const VALID_ACCESS = "valid-access";
const identity = { userId: "user-1", sessionId: "sess-1", kind: "native_access", scope: "native" };

describe("POST /api/auth/native/logout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 when a valid refresh revokes the session, even with a valid bearer present (no false 401)", async () => {
    // 有效 refresh 已吊销会话 → 权威注销成功
    serviceMock.revokeByRefreshToken.mockResolvedValue(true);
    // bearer 即使有效也不应再基于「已注销会话」判失败
    serviceMock.resolveAccessToken.mockResolvedValue(identity);

    const res = await POST(logoutRequest({ refreshToken: VALID_REFRESH }, VALID_ACCESS));

    expect(res.status).toBe(204);
    expect(serviceMock.revokeByRefreshToken).toHaveBeenCalledWith(VALID_REFRESH);
    // 因 refresh 已权威吊销，不再进入 bearer 判失败路径
    expect(serviceMock.resolveAccessToken).not.toHaveBeenCalled();
  });

  it("returns 204 on a valid refresh even when the accompanying bearer is invalid (refresh is authoritative)", async () => {
    serviceMock.revokeByRefreshToken.mockResolvedValue(true);
    // 即使 bearer 解析会失败，也不得把已成功的注销翻成 401
    serviceMock.resolveAccessToken.mockResolvedValue(null);

    const res = await POST(logoutRequest({ refreshToken: VALID_REFRESH }, "garbage-access"));

    expect(res.status).toBe(204);
    expect(serviceMock.resolveAccessToken).not.toHaveBeenCalled();
  });

  it("keeps an invalid bearer non-bypassable when no authoritative refresh is present (401)", async () => {
    // 未知 refresh → revokeByRefreshToken false；bearer 也无效 → 401，不可绕过
    serviceMock.revokeByRefreshToken.mockResolvedValue(false);
    serviceMock.resolveAccessToken.mockResolvedValue(null);

    const res = await POST(logoutRequest({ refreshToken: "unknown-refresh-00000000" }, "invalid-access"));

    expect(res.status).toBe(401);
    expect(serviceMock.revokeByRefreshToken).toHaveBeenCalled();
    expect(serviceMock.resolveAccessToken).toHaveBeenCalledWith("invalid-access");
  });

  it("allows a valid bearer to revoke when the refresh is unknown (bearer authoritative)", async () => {
    serviceMock.revokeByRefreshToken.mockResolvedValue(false);
    serviceMock.resolveAccessToken.mockResolvedValue(identity);

    const res = await POST(logoutRequest({ refreshToken: "unknown-refresh-00000000" }, VALID_ACCESS));

    expect(res.status).toBe(204);
    expect(serviceMock.revokeSession).toHaveBeenCalledWith("user-1", "sess-1");
  });

  it("returns 400 when no identity (no bearer and no refresh) is supplied", async () => {
    const res = await POST(logoutRequest({}));
    expect(res.status).toBe(400);
  });
});
