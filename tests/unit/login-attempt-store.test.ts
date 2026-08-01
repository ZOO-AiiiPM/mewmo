import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemoryLoginAttemptStore,
  MemoryRefreshFailStore,
  RedisLoginAttemptStore,
  RedisRefreshFailStore,
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

describe("MemoryRefreshFailStore (IP-authoritative refresh limit)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("converges distinct invalid tokens from the same IP onto one bounded bucket", async () => {
    const store = new MemoryRefreshFailStore();

    // 每次提交一个不同的随机 hash（模拟「每次换新 token 枚举」），都失败
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i += 1) {
      await store.recordFailure(`hash${i}`, "1.2.3.4");
      // 未达上限前不锁定
      if (i < LOGIN_MAX_ATTEMPTS - 1) {
        expect(await store.isLocked(`hash${i + 1}`, "1.2.3.4")).toBe(false);
      }
    }

    // 任意一个新 token（之前没见过的）从同一 IP 刷新都被锁
    expect(await store.isLocked("brand-new-hash", "1.2.3.4")).toBe(true);
    // 不同 IP 不受影响
    expect(await store.isLocked("brand-new-hash", "5.6.7.8")).toBe(false);
  });

  it("also isolates a per-token replay bucket for one specific token", async () => {
    const store = new MemoryRefreshFailStore();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i += 1) {
      await store.recordFailure("same-token-hash", "1.2.3.4");
    }
    expect(await store.isLocked("same-token-hash", "1.2.3.4")).toBe(true);
  });

  it("clear on success resets both the IP and token buckets", async () => {
    const store = new MemoryRefreshFailStore();
    await store.recordFailure("a", "1.2.3.4");
    await store.recordFailure("b", "1.2.3.4"); // 不同 token 累计到 IP 桶

    await store.clear("c", "1.2.3.4"); // 成功 clears IP 桶

    await store.recordFailure("x", "1.2.3.4");
    expect(await store.isLocked("y", "1.2.3.4")).toBe(false);
  });
});

describe("RedisRefreshFailStore (IP-authoritative refresh limit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keys the authoritative bucket on IP only, independent of the token hash", async () => {
    const store = new RedisRefreshFailStore();
    redisMock.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await store.recordFailure("hash-A", "9.9.9.9");

    expect(redisMock.incr).toHaveBeenNthCalledWith(1, "refresh-fail-ip:9.9.9.9");
    expect(redisMock.incr).toHaveBeenNthCalledWith(2, "refresh-fail-token:hash-A:9.9.9.9");
  });

  it("locks when the IP bucket reaches the limit even for a never-seen token hash", async () => {
    const store = new RedisRefreshFailStore();
    redisMock.get
      .mockResolvedValueOnce(String(LOGIN_MAX_ATTEMPTS)) // IP 桶达上限
      .mockResolvedValueOnce(null); // token 桶为空

    expect(await store.isLocked("fresh-hash", "1.2.3.4")).toBe(true);
  });

  it("clear deletes both IP and token keys", async () => {
    const store = new RedisRefreshFailStore();
    await store.clear("h", "1.2.3.4");
    expect(redisMock.del).toHaveBeenCalledWith("refresh-fail-ip:1.2.3.4");
    expect(redisMock.del).toHaveBeenCalledWith("refresh-fail-token:h:1.2.3.4");
  });
});
