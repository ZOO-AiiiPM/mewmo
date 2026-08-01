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

/** 登录与刷新的限速桶前缀分离，避免「错误密码」与「refresh 重放」共用一个计数器。 */
const LOGIN_BUCKET_PREFIX = "login-fail";
const REFRESH_BUCKET_PREFIX = "refresh-fail";

interface AttemptEntry {
  count: number;
  expiresAt: number; // epoch ms；未达上限时是计数窗口终点，达上限后是锁定终点
}

/** 进程内存储，用于单元测试与 REDIS_URL 未配置时的降级（非多实例安全）。 */
export class MemoryLoginAttemptStore implements LoginRateLimiter {
  private entries = new Map<string, AttemptEntry>();
  private readonly prefix: string;

  constructor(prefix = LOGIN_BUCKET_PREFIX) {
    this.prefix = prefix;
  }

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
    this.entries.set(`${this.prefix}:${key}`, { count, expiresAt });
  }

  async clear(email: string, ip: string): Promise<void> {
    this.entries.delete(`${this.prefix}:${keyOf(email, ip)}`);
  }

  private get(key: string, now = Date.now()): AttemptEntry | null {
    const entry = this.entries.get(`${this.prefix}:${key}`);
    if (!entry) return null;
    if (now > entry.expiresAt) {
      this.entries.delete(`${this.prefix}:${key}`);
      return null;
    }
    return entry;
  }
}

/** Redis 存储，生产/多实例环境使用；key = <prefix>:<identifier>:<ip>，值为失败次数。 */
export class RedisLoginAttemptStore implements LoginRateLimiter {
  private readonly prefix: string;

  constructor(prefix = LOGIN_BUCKET_PREFIX) {
    this.prefix = prefix;
  }

  private key(email: string, ip: string): string {
    return `${this.prefix}:${keyOf(email, ip)}`;
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
let refreshMemoryFallback: MemoryLoginAttemptStore | null = null;

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

/**
 * 返回当前环境的刷新限速器（独立 `refresh-fail` 桶，不与登录计数器共享）。
 * 键使用 refresh token 的 HMAC 哈希 + IP，不泄露 token。
 */
export function getRefreshRateLimiter(): LoginRateLimiter {
  if (process.env.REDIS_URL) {
    return new RedisLoginAttemptStore(REFRESH_BUCKET_PREFIX);
  }
  if (!refreshMemoryFallback) {
    refreshMemoryFallback = new MemoryLoginAttemptStore(REFRESH_BUCKET_PREFIX);
    console.warn("[login-attempt-store] REDIS_URL 未配置，使用进程内刷新限速（不适用于生产 / 多实例）。");
  }
  return refreshMemoryFallback;
}
