import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemoryLoginAttemptStore,
  RedisLoginAttemptStore,
} from "../../apps/web/src/lib/login-attempt-store";
import {
  LOGIN_ATTEMPT_WINDOW_SECONDS,
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_ATTEMPTS,
} from "../../packages/auth/src/login-rate-limit";

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../../apps/web/src/lib/redis-client", () => ({
  getRedisClient: () => redisMock,
}));

async function failTimes(
  store: MemoryLoginAttemptStore,
  email: string,
  ip: string,
  times: number,
): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await store.recordFailure(email, ip);
  }
}

describe("MemoryLoginAttemptStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks after max failures, matching emails case-insensitively", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "User@Example.com", "1.2.3.4", LOGIN_MAX_ATTEMPTS - 1);
    expect(await store.isLocked("user@example.com", "1.2.3.4")).toBe(false);

    await store.recordFailure("user@example.com", "1.2.3.4");
    expect(await store.isLocked("User@Example.com", "1.2.3.4")).toBe(true);
  });

  it("keeps counters isolated per email and per ip", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "a@b.com", "1.1.1.1", LOGIN_MAX_ATTEMPTS);

    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(true);
    expect(await store.isLocked("a@b.com", "2.2.2.2")).toBe(false);
    expect(await store.isLocked("c@d.com", "1.1.1.1")).toBe(false);
  });

  it("unlocks after the lock period passes", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "a@b.com", "1.1.1.1", LOGIN_MAX_ATTEMPTS);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(true);

    vi.advanceTimersByTime(LOGIN_LOCK_SECONDS * 1000 + 1000);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);
  });

  it("refreshes the lock when failures continue while locked", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "a@b.com", "1.1.1.1", LOGIN_MAX_ATTEMPTS);

    // 锁定期过半继续失败 → 锁定期从此刻重新起算
    vi.advanceTimersByTime((LOGIN_LOCK_SECONDS - 60) * 1000);
    await store.recordFailure("a@b.com", "1.1.1.1");

    vi.advanceTimersByTime((LOGIN_LOCK_SECONDS - 60) * 1000);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(true);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);
  });

  it("expires failure counts after the attempt window", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "a@b.com", "1.1.1.1", LOGIN_MAX_ATTEMPTS - 1);

    vi.advanceTimersByTime(LOGIN_ATTEMPT_WINDOW_SECONDS * 1000 + 1000);

    // 窗口过期后计数归零：再失败一次不足以锁定
    await store.recordFailure("a@b.com", "1.1.1.1");
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);
  });

  it("clear resets the counter after failures", async () => {
    const store = new MemoryLoginAttemptStore();
    await failTimes(store, "a@b.com", "1.1.1.1", LOGIN_MAX_ATTEMPTS);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(true);

    await store.clear("a@b.com", "1.1.1.1");
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);
  });
});

describe("RedisLoginAttemptStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the attempt window on the first failure and lowercases the email in the key", async () => {
    const store = new RedisLoginAttemptStore();
    redisMock.incr.mockResolvedValueOnce(1);

    await store.recordFailure("User@Example.com", "1.2.3.4");

    expect(redisMock.incr).toHaveBeenCalledWith("login-fail:user@example.com:1.2.3.4");
    expect(redisMock.expire).toHaveBeenCalledWith(
      "login-fail:user@example.com:1.2.3.4",
      LOGIN_ATTEMPT_WINDOW_SECONDS,
    );
  });

  it("keeps the original window below the limit and refreshes the lock at or above it", async () => {
    const store = new RedisLoginAttemptStore();

    redisMock.incr.mockResolvedValueOnce(LOGIN_MAX_ATTEMPTS - 1);
    await store.recordFailure("a@b.com", "1.1.1.1");
    expect(redisMock.expire).not.toHaveBeenCalled();

    redisMock.incr.mockResolvedValueOnce(LOGIN_MAX_ATTEMPTS + 2);
    await store.recordFailure("a@b.com", "1.1.1.1");
    expect(redisMock.expire).toHaveBeenCalledWith("login-fail:a@b.com:1.1.1.1", LOGIN_LOCK_SECONDS);
  });

  it("reports locked only at or above the failure limit", async () => {
    const store = new RedisLoginAttemptStore();

    redisMock.get.mockResolvedValueOnce(null);
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);

    redisMock.get.mockResolvedValueOnce(String(LOGIN_MAX_ATTEMPTS - 1));
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(false);

    redisMock.get.mockResolvedValueOnce(String(LOGIN_MAX_ATTEMPTS));
    expect(await store.isLocked("a@b.com", "1.1.1.1")).toBe(true);
  });

  it("clear deletes the counter key", async () => {
    const store = new RedisLoginAttemptStore();

    await store.clear("a@b.com", "1.1.1.1");

    expect(redisMock.del).toHaveBeenCalledWith("login-fail:a@b.com:1.1.1.1");
  });
});
