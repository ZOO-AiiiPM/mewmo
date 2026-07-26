import { describe, expect, it } from "vitest";

import { mapLoginError, parseLoginBody } from "../../apps/web/src/lib/login-request";
import {
  AuthError,
  CredentialsSignin,
  LoginRateLimitError,
} from "../../packages/auth/src/login-rate-limit";

describe("parseLoginBody", () => {
  it("accepts a valid email/password body", () => {
    expect(parseLoginBody({ email: "a@b.com", password: "pw" })).toEqual({
      email: "a@b.com",
      password: "pw",
    });
  });

  it("rejects malformed payloads", () => {
    expect(parseLoginBody(null)).toBeNull();
    expect(parseLoginBody("not-an-object")).toBeNull();
    expect(parseLoginBody({ email: "a@b.com" })).toBeNull();
    expect(parseLoginBody({ email: "not-an-email", password: "pw" })).toBeNull();
    expect(parseLoginBody({ email: "a@b.com", password: "" })).toBeNull();
  });
});

describe("mapLoginError", () => {
  it("maps a rate-limit error to 429", () => {
    expect(mapLoginError(new LoginRateLimitError())).toEqual({
      status: 429,
      error: "尝试次数过多，请 10 分钟后再试",
    });
  });

  it("maps a wrapped rate-limit error (CallbackRouteError shape) to 429", () => {
    const wrapper = new AuthError();
    wrapper.cause = { err: new LoginRateLimitError(), provider: "credentials" };
    expect(mapLoginError(wrapper)?.status).toBe(429);
  });

  it("maps errors carrying the rate-limit code to 429 even across class instances", () => {
    const err = new CredentialsSignin();
    err.code = "login_rate_limited";
    expect(mapLoginError(err)?.status).toBe(429);
  });

  it("maps other auth errors to 401 with the existing message", () => {
    expect(mapLoginError(new CredentialsSignin())).toEqual({
      status: 401,
      error: "Invalid email or password",
    });
  });

  it("returns null for non-auth errors so callers rethrow", () => {
    expect(mapLoginError(new Error("boom"))).toBeNull();
  });
});
