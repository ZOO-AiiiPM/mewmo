import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PASSWORD_RESET_TTL_SECONDS,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "./password-reset";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = 1_700_000_000;

function sign(payload: { email: string; userId: string }, secret: string = SECRET, now: number = NOW) {
  return signPasswordResetToken(payload, secret, now);
}

function verify(token: string, secret: string = SECRET, now: number = NOW) {
  return verifyPasswordResetToken(token, secret, now);
}

describe("signPasswordResetToken / verifyPasswordResetToken", () => {
  it("round-trips a valid token and returns email + userId", () => {
    const token = sign({ email: "user@example.com", userId: "user-1" });

    const result = verify(token);

    expect(result).toEqual({
      ok: true,
      email: "user@example.com",
      userId: "user-1",
    });
  });

  it("sets exp to now + TTL (15 minutes)", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" }, SECRET, NOW);

    // at NOW + TTL - 1, still valid
    expect(verify(token, SECRET, NOW + PASSWORD_RESET_TTL_SECONDS - 1).ok).toBe(true);
    // at NOW + TTL, expired (exp <= now)
    expect(verify(token, SECRET, NOW + PASSWORD_RESET_TTL_SECONDS)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("accepts a token verified at the exact second before exp", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" });
    // verify at exp - 1
    expect(verify(token, SECRET, NOW + PASSWORD_RESET_TTL_SECONDS - 1).ok).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" });
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    expect(verify(tampered)).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" });
    const [header, , signature] = token.split(".");
    // forge a payload with a different email
    const forgedPayload = Buffer.from(
      JSON.stringify({
        email: "attacker@evil.com",
        userId: "u-1",
        purpose: "password_reset",
        iat: NOW,
        exp: NOW + PASSWORD_RESET_TTL_SECONDS,
      }),
    ).toString("base64url");
    const tampered = `${header}.${forgedPayload}.${signature}`;

    expect(verify(tampered)).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects verification with a different secret", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" }, SECRET);

    expect(verify(token, "different-secret")).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects an expired token", () => {
    const token = sign({ email: "u@e.com", userId: "u-1" }, SECRET, NOW);

    expect(verify(token, SECRET, NOW + PASSWORD_RESET_TTL_SECONDS + 1)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("rejects a token with wrong purpose", () => {
    // forge a token with purpose !== "password_reset", signed correctly
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "u@e.com",
        userId: "u-1",
        purpose: "email_verification",
        iat: NOW,
        exp: NOW + PASSWORD_RESET_TTL_SECONDS,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${signature}`;

    expect(verify(token)).toEqual({ ok: false, error: "wrong_purpose" });
  });

  it("rejects tokens with wrong number of segments", () => {
    expect(verify("only.one")).toEqual({ ok: false, error: "invalid_format" });
    expect(verify("a.b.c.d")).toEqual({ ok: false, error: "invalid_format" });
    expect(verify("")).toEqual({ ok: false, error: "invalid_format" });
    expect(verify("no-dots-at-all")).toEqual({ ok: false, error: "invalid_format" });
  });

  it("rejects a header with alg !== HS256 (alg confusion defense)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "u@e.com",
        userId: "u-1",
        purpose: "password_reset",
        iat: NOW,
        exp: NOW + PASSWORD_RESET_TTL_SECONDS,
      }),
    ).toString("base64url");
    // signature is irrelevant — alg check happens after signature check passes,
    // but we still sign with HS256 so the signature is valid, then alg should reject
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${signature}`;

    expect(verify(token)).toEqual({ ok: false, error: "invalid_format" });
  });

  it("rejects non-JSON payload", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from("not-json{{{").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");

    expect(verify(`${header}.${payload}.${signature}`)).toEqual({
      ok: false,
      error: "invalid_format",
    });
  });

  it("rejects a payload missing email", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        userId: "u-1",
        purpose: "password_reset",
        iat: NOW,
        exp: NOW + PASSWORD_RESET_TTL_SECONDS,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");

    expect(verify(`${header}.${payload}.${signature}`)).toEqual({
      ok: false,
      error: "invalid_format",
    });
  });

  it("rejects a payload missing userId", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        email: "u@e.com",
        purpose: "password_reset",
        iat: NOW,
        exp: NOW + PASSWORD_RESET_TTL_SECONDS,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");

    expect(verify(`${header}.${payload}.${signature}`)).toEqual({
      ok: false,
      error: "invalid_format",
    });
  });

  it("produces different tokens for different users", () => {
    const t1 = sign({ email: "a@e.com", userId: "u-1" });
    const t2 = sign({ email: "b@e.com", userId: "u-2" });

    expect(t1).not.toBe(t2);
  });

  it("handles email and userId with unicode characters", () => {
    const token = sign({ email: "用户@例子.com", userId: "user-中文" });

    expect(verify(token)).toEqual({
      ok: true,
      email: "用户@例子.com",
      userId: "user-中文",
    });
  });
});
