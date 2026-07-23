import { describe, expect, it } from "vitest";

import { MemoryOtpStore, OTP_TTL_SECONDS } from "./otp-store";

describe("MemoryOtpStore", () => {
  it("verify returns ok for the saved code (email case-insensitive)", async () => {
    const store = new MemoryOtpStore();
    await store.save("User@Example.com", "register", "482913", OTP_TTL_SECONDS);
    const result = await store.verify("user@example.com", "register", "482913");
    expect(result.status).toBe("ok");
  });

  it("verify returns invalid for a wrong code", async () => {
    const store = new MemoryOtpStore();
    await store.save("a@b.com", "reset", "123456", OTP_TTL_SECONDS);
    const result = await store.verify("A@B.com", "reset", "000000");
    expect(result.status).toBe("invalid");
  });

  it("locks after max attempts and rejects even the correct code", async () => {
    const store = new MemoryOtpStore();
    await store.save("a@b.com", "reset", "123456", OTP_TTL_SECONDS);
    expect((await store.verify("a@b.com", "reset", "000001")).status).toBe("invalid");
    expect((await store.verify("a@b.com", "reset", "000002")).status).toBe("invalid");
    expect((await store.verify("a@b.com", "reset", "000003")).status).toBe("invalid");
    expect((await store.verify("a@b.com", "reset", "000004")).status).toBe("invalid");
    expect((await store.verify("a@b.com", "reset", "000005")).status).toBe("too_many_attempts");
    expect((await store.verify("a@b.com", "reset", "123456")).status).toBe("too_many_attempts");
  });

  it("verify returns not_found for an unknown email", async () => {
    const store = new MemoryOtpStore();
    const result = await store.verify("nobody@x.com", "register", "123456");
    expect(result.status).toBe("not_found");
  });

  it("verify treats an already-expired entry as expired", async () => {
    const store = new MemoryOtpStore();
    await store.save("a@b.com", "register", "123456", -1); // 已过期
    const result = await store.verify("a@b.com", "register", "123456");
    expect(result.status).toBe("expired");
  });

  it("peek returns the entry and records sentAt", async () => {
    const store = new MemoryOtpStore();
    await store.save("a@b.com", "register", "123456", OTP_TTL_SECONDS);
    const entry = await store.peek("a@b.com", "register");
    expect(entry).not.toBeNull();
    expect(typeof entry!.sentAt).toBe("number");
    expect(entry!.code).toBe("123456");
  });

  it("clear removes the entry", async () => {
    const store = new MemoryOtpStore();
    await store.save("a@b.com", "reset", "123456", OTP_TTL_SECONDS);
    await store.clear("a@b.com", "reset");
    const result = await store.verify("a@b.com", "reset", "123456");
    expect(result.status).toBe("not_found");
  });
});
