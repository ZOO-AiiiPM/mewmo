import { describe, expect, it } from "vitest";

import {
  NATIVE_ACCESS_TTL_SECONDS,
  NATIVE_PLATFORMS,
  NATIVE_REFRESH_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  normalizeDeviceId,
  normalizePlatform,
  signNativeAccessToken,
  verifyNativeAccessToken,
} from "./native-session";

const SECRET = "test-secret";

describe("native session primitives", () => {
  it("round-trips a native access token with userId and sessionId claims", async () => {
    const token = await signNativeAccessToken({ userId: "u1", sessionId: "s1" }, SECRET);

    const verified = await verifyNativeAccessToken(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.payload).toMatchObject({ userId: "u1", sessionId: "s1", scope: "native" });
    expect(verified!.expired).toBe(false);
    expect(NATIVE_ACCESS_TTL_SECONDS).toBe(15 * 60);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signNativeAccessToken({ userId: "u1", sessionId: "s1" }, "other-secret");
    await expect(verifyNativeAccessToken(token, SECRET)).resolves.toBeNull();
  });

  it("rejects garbage tokens", async () => {
    await expect(verifyNativeAccessToken("not-a-jwt", SECRET)).resolves.toBeNull();
    await expect(verifyNativeAccessToken("", SECRET)).resolves.toBeNull();
  });

  it("marks short-lived tokens as expired once past ttl", async () => {
    const token = await signNativeAccessToken({ userId: "u1", sessionId: "s1" }, SECRET, 0);
    // exp 与 iat 相同 → now 已 > exp，视为 expired；但验签成功仍返回 claims。
    await new Promise((r) => setTimeout(r, 5));
    const verified = await verifyNativeAccessToken(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.expired).toBe(true);
  });

  it("generates unique opaque refresh tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes refresh tokens deterministically and never stores plaintext", () => {
    const token = generateRefreshToken();
    const h1 = hashRefreshToken(token, SECRET);
    const h2 = hashRefreshToken(token, SECRET);
    expect(h1).toBe(h2);
    expect(h1).not.toContain(token);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces distinct hashes for distinct tokens", () => {
    expect(hashRefreshToken("t1", SECRET)).not.toBe(hashRefreshToken("t2", SECRET));
  });

  it("normalizes platform and falls back to ios", () => {
    expect(NATIVE_PLATFORMS).toEqual(["macos", "ios", "ipados"]);
    expect(normalizePlatform("macos")).toBe("macos");
    expect(normalizePlatform("ipados")).toBe("ipados");
    expect(normalizePlatform("android")).toBe("ios");
    expect(normalizePlatform(undefined)).toBe("ios");
    expect(normalizePlatform("")).toBe("ios");
    expect(NATIVE_REFRESH_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("normalizes deviceId and derives a stable session-local id when absent", () => {
    expect(normalizeDeviceId("  my-device  ")).toBe("my-device");
    const fallback = normalizeDeviceId("");
    expect(fallback).toMatch(/^device-/);
    expect(normalizeDeviceId(123)).toMatch(/^device-/);
  });
});
