import {
  LOGIN_ATTEMPT_WINDOW_SECONDS,
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  type LoginRateLimiter,
} from "@mewmo/auth";

import { getRedisClient } from "./redis-client";

function keyOf(email: string, ip: string): string {
  return `${email.toLowerCase()}:${ip}`;
}

interface AttemptEntry {
  count: number;
  expiresAt: number; // epoch ms；未达上限时是计数窗口终点，达上限后是锁定终点
}

/** 进程内存储，用于单元测试与 REDIS_URL 未配置时的降级（非多实例安全）。 */
export class MemoryLoginAttemptStore implements LoginRateLimiter {
  private entries = new Map<string, AttemptEntry>();

  async isLocked(email: string, ip: string): Promise<boolean> {
    const entry = this.get(keyOf(email, ip));
    return entry !== null && entry.count >= LOGIN_MAX_ATTEMPTS;
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const key = keyOf(email, ip);
    const now = Date.now();
    const existing = this.get(key, now);
    const count = (existing?.count ?? 0) + 1;
    // 达到上限后每次失败都刷新锁定期；未达上限沿用首次失败起算的窗口
    const expiresAt =
      count >= LOGIN_MAX_ATTEMPTS
        ? now + LOGIN_LOCK_SECONDS * 1000
        : (existing?.expiresAt ?? now + LOGIN_ATTEMPT_WINDOW_SECONDS * 1000);
    this.entries.set(key, { count, expiresAt });
  }

  async clear(email: string, ip: string): Promise<void> {
    this.entries.delete(keyOf(email, ip));
  }

  private get(key: string, now = Date.now()): AttemptEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (now > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }
}

/** Redis 存储，生产/多实例环境使用；key = login-fail:<email>:<ip>，值为失败次数。 */
export class RedisLoginAttemptStore implements LoginRateLimiter {
  private key(email: string, ip: string): string {
    return `login-fail:${keyOf(email, ip)}`;
  }

  async isLocked(email: string, ip: string): Promise<boolean> {
    const raw = await getRedisClient().get(this.key(email, ip));
    return raw !== null && Number(raw) >= LOGIN_MAX_ATTEMPTS;
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const client = getRedisClient();
    const key = this.key(email, ip);
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
    } else if (count >= LOGIN_MAX_ATTEMPTS) {
      // 达上限后每次失败刷新锁定期，与进程内实现语义一致
      await client.expire(key, LOGIN_LOCK_SECONDS);
    }
  }

  async clear(email: string, ip: string): Promise<void> {
    await getRedisClient().del(this.key(email, ip));
  }
}

let memoryFallback: MemoryLoginAttemptStore | null = null;

/**
 * 返回当前环境的登录限速器：配置了 REDIS_URL 用 Redis，否则降级为进程内存储。
 * 降级模式仅用于本地开发 / 单实例；生产必须配置 REDIS_URL（与 OTP 存储一致）。
 */
export function getLoginRateLimiter(): LoginRateLimiter {
  if (process.env.REDIS_URL) {
    return new RedisLoginAttemptStore();
  }
  if (!memoryFallback) {
    memoryFallback = new MemoryLoginAttemptStore();
    console.warn("[login-attempt-store] REDIS_URL 未配置，使用进程内登录限速（不适用于生产 / 多实例）。");
  }
  return memoryFallback;
}
