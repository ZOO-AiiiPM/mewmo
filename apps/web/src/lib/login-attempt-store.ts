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
/** 刷新限速：IP 级桶（权威上限，不管 token 是否变化都收敛到同一桶）+ token 重放桶。 */
const REFRESH_IP_BUCKET_PREFIX = "refresh-fail-ip";
const REFRESH_TOKEN_BUCKET_PREFIX = "refresh-fail-token";

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

/**
 * refresh 限速接口。入参第一个参数是 refresh token 的 HMAC 哈希（非明文），第二个是客户端 IP。
 * 语义上与 `LoginRateLimiter` 相同，但键派生按「IP 权威桶 + token 重放桶」设计。
 */
export interface RefreshFailLimiter {
  isLocked(refreshTokenHash: string, ip: string): Promise<boolean>;
  recordFailure(refreshTokenHash: string, ip: string): Promise<void>;
  clear(refreshTokenHash: string, ip: string): Promise<void>;
}

/** 进程内 refresh 限速：IP 权威桶 + token 重放桶。 */
export class MemoryRefreshFailStore implements RefreshFailLimiter {
  private ipEntries = new Map<string, AttemptEntry>();
  private tokenEntries = new Map<string, AttemptEntry>();

  async isLocked(refreshTokenHash: string, ip: string): Promise<boolean> {
    const ipEntry = this.ipGet(ip);
    if (ipEntry !== null && ipEntry.count >= LOGIN_MAX_ATTEMPTS) return true;

    const tokenEntry = this.tokenGet(refreshTokenHash, ip);
    return tokenEntry !== null && tokenEntry.count >= LOGIN_MAX_ATTEMPTS;
  }

  async recordFailure(refreshTokenHash: string, ip: string): Promise<void> {
    // IP 权威桶：不随 token 变化，收敛同一来源的全部失败
    this.ipRecord(ip);
    // token 重放桶：针对特定 token
    this.tokenRecord(refreshTokenHash, ip);
  }

  async clear(refreshTokenHash: string, ip: string): Promise<void> {
    this.ipEntries.delete(ipKey(REFRESH_IP_BUCKET_PREFIX, ip));
    this.tokenEntries.delete(tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, refreshTokenHash, ip));
  }

  private entryFor(now: number, existing?: AttemptEntry | null): AttemptEntry {
    const count = (existing?.count ?? 0) + 1;
    return {
      count,
      expiresAt:
        count >= LOGIN_MAX_ATTEMPTS
          ? now + LOGIN_LOCK_SECONDS * 1000
          : (existing?.expiresAt ?? now + LOGIN_ATTEMPT_WINDOW_SECONDS * 1000),
    };
  }

  private ipRecord(ip: string): void {
    const now = Date.now();
    const key = ipKey(REFRESH_IP_BUCKET_PREFIX, ip);
    const existing = this.peekEntry(this.ipEntries, key, now);
    this.ipEntries.set(key, this.entryFor(now, existing));
  }

  private tokenRecord(hash: string, ip: string): void {
    const now = Date.now();
    const key = tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, hash, ip);
    const existing = this.peekEntry(this.tokenEntries, key, now);
    this.tokenEntries.set(key, this.entryFor(now, existing));
  }

  private ipGet(ip: string): AttemptEntry | null {
    return this.peekEntry(this.ipEntries, ipKey(REFRESH_IP_BUCKET_PREFIX, ip));
  }

  private tokenGet(hash: string, ip: string): AttemptEntry | null {
    return this.peekEntry(this.tokenEntries, tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, hash, ip));
  }

  private peekEntry(map: Map<string, AttemptEntry>, key: string, now = Date.now()): AttemptEntry | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (now > entry.expiresAt) {
      map.delete(key);
      return null;
    }
    return entry;
  }
}

function ipKey(prefix: string, ip: string): string {
  return `${prefix}:${ip}`;
}

function tokenKey(prefix: string, hash: string, ip: string): string {
  return `${prefix}:${hash}:${ip}`;
}

/** Redis refresh 限速：IP 权威桶 + token 重放桶。 */
export class RedisRefreshFailStore implements RefreshFailLimiter {
  async isLocked(refreshTokenHash: string, ip: string): Promise<boolean> {
    const client = getRedisClient();
    const [ipRaw, tokenRaw] = await Promise.all([
      client.get(ipKey(REFRESH_IP_BUCKET_PREFIX, ip)),
      client.get(tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, refreshTokenHash, ip)),
    ]);
    return (ipRaw !== null && Number(ipRaw) >= LOGIN_MAX_ATTEMPTS) ||
      (tokenRaw !== null && Number(tokenRaw) >= LOGIN_MAX_ATTEMPTS);
  }

  async recordFailure(refreshTokenHash: string, ip: string): Promise<void> {
    const client = getRedisClient();
    await this.incrBucket(client, ipKey(REFRESH_IP_BUCKET_PREFIX, ip));
    await this.incrBucket(client, tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, refreshTokenHash, ip));
  }

  private async incrBucket(client: { incr(key: string): Promise<number>; expire(key: string, s: number): Promise<unknown> }, key: string): Promise<void> {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
    } else if (count >= LOGIN_MAX_ATTEMPTS) {
      await client.expire(key, LOGIN_LOCK_SECONDS);
    }
  }

  async clear(refreshTokenHash: string, ip: string): Promise<void> {
    const client = getRedisClient();
    await client.del(ipKey(REFRESH_IP_BUCKET_PREFIX, ip));
    await client.del(tokenKey(REFRESH_TOKEN_BUCKET_PREFIX, refreshTokenHash, ip));
  }
}

let memoryFallback: MemoryLoginAttemptStore | null = null;
let refreshMemoryFallback: RefreshFailLimiter | null = null;

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
 * refresh 限速器：IP 级失败桶（权威上限）+ token 重放桶。
 *
 * 键不含明文 token（只含 HMAC 哈希 / 纯 IP）：
 * - IP 桶 `refresh-fail-ip:<ip>`：无论 token 是否变化，同一来源的失败都收敛到同一桶，
 *   从而抑制「每次提交随机新 token 刷新桶」的枚举。
 * - token 桶 `refresh-fail-token:<hash>:<ip>`：针对特定 token 的重复重放。
 */
export function getRefreshRateLimiter(): RefreshFailLimiter {
  if (process.env.REDIS_URL) {
    return new RedisRefreshFailStore();
  }
  if (!refreshMemoryFallback) {
    refreshMemoryFallback = new MemoryRefreshFailStore();
    console.warn("[login-attempt-store] REDIS_URL 未配置，使用进程内刷新限速（不适用于生产 / 多实例）。");
  }
  return refreshMemoryFallback;
}
