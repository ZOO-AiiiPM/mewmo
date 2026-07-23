import { timingSafeEqual } from "node:crypto";

import IORedis from "ioredis";

import { generateOtpCode, safeEqualString } from "./otp-code";

export type OtpPurpose = "register" | "reset";

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60; // 10 分钟
export const OTP_MAX_ATTEMPTS = 5; // 连续错误上限，超过锁定
export const OTP_LOCK_SECONDS = 10 * 60; // 锁定 10 分钟
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // 同一邮箱 60s 内只能重发一次

export type OtpVerifyStatus = "ok" | "not_found" | "expired" | "invalid" | "too_many_attempts";

export interface OtpVerifyResult {
  status: OtpVerifyStatus;
}

export interface OtpEntry {
  code: string;
  expiresAt: number; // epoch ms
  attempts: number;
  sentAt: number; // epoch ms，用于重发冷却
  lockUntil?: number; // epoch ms，锁定解除时间
}

export interface OtpStore {
  save(email: string, purpose: OtpPurpose, code: string, ttlSeconds: number): Promise<void>;
  peek(email: string, purpose: OtpPurpose): Promise<OtpEntry | null>;
  verify(email: string, purpose: OtpPurpose, code: string): Promise<OtpVerifyResult>;
  clear(email: string, purpose: OtpPurpose): Promise<void>;
}

export function otpVerifyErrorMessage(status: OtpVerifyStatus): string {
  switch (status) {
    case "expired":
      return "验证码已过期，请重新获取";
    case "invalid":
      return "验证码错误";
    case "too_many_attempts":
      return "尝试次数过多，请 10 分钟后再试";
    case "not_found":
      return "请先获取验证码";
    default:
      return "验证码校验失败";
  }
}

function keyOf(email: string, purpose: OtpPurpose): string {
  return `${email.toLowerCase()}:${purpose}`;
}

/** 进程内存储，用于单元测试与 REDIS_URL 未配置时的降级（非多实例安全）。 */
export class MemoryOtpStore implements OtpStore {
  private entries = new Map<string, OtpEntry>();

  async save(email: string, purpose: OtpPurpose, code: string, ttlSeconds: number): Promise<void> {
    this.entries.set(keyOf(email, purpose), {
      code,
      expiresAt: Date.now() + ttlSeconds * 1000,
      attempts: 0,
      sentAt: Date.now(),
    });
  }

  async peek(email: string, purpose: OtpPurpose): Promise<OtpEntry | null> {
    const key = keyOf(email, purpose);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async verify(email: string, purpose: OtpPurpose, code: string): Promise<OtpVerifyResult> {
    const key = keyOf(email, purpose);
    const entry = this.entries.get(key);
    if (!entry) return { status: "not_found" };

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.entries.delete(key);
      return { status: "expired" };
    }
    if (entry.lockUntil && now < entry.lockUntil) {
      return { status: "too_many_attempts" };
    }
    if (!safeEqualString(code, entry.code)) {
      entry.attempts += 1;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        entry.lockUntil = now + OTP_LOCK_SECONDS * 1000;
      }
      return { status: entry.lockUntil ? "too_many_attempts" : "invalid" };
    }
    this.entries.delete(key);
    return { status: "ok" };
  }

  async clear(email: string, purpose: OtpPurpose): Promise<void> {
    this.entries.delete(keyOf(email, purpose));
  }
}

/** Redis 存储，生产/多实例环境使用；key = otp:<email>:<purpose>，TTL 随验证码过期。 */
export class RedisOtpStore implements OtpStore {
  private static client: IORedis | null = null;

  private static getClient(): IORedis {
    if (!RedisOtpStore.client) {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error("REDIS_URL is not configured");
      RedisOtpStore.client = new IORedis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
      });
    }
    return RedisOtpStore.client;
  }

  private key(email: string, purpose: OtpPurpose): string {
    return `otp:${keyOf(email, purpose)}`;
  }

  async save(email: string, purpose: OtpPurpose, code: string, ttlSeconds: number): Promise<void> {
    const entry: OtpEntry = {
      code,
      expiresAt: Date.now() + ttlSeconds * 1000,
      attempts: 0,
      sentAt: Date.now(),
    };
    await RedisOtpStore.getClient().set(this.key(email, purpose), JSON.stringify(entry), "EX", ttlSeconds);
  }

  async peek(email: string, purpose: OtpPurpose): Promise<OtpEntry | null> {
    const raw = await RedisOtpStore.getClient().get(this.key(email, purpose));
    if (!raw) return null;
    const entry = JSON.parse(raw) as OtpEntry;
    if (Date.now() > entry.expiresAt) {
      await this.clear(email, purpose);
      return null;
    }
    return entry;
  }

  async verify(email: string, purpose: OtpPurpose, code: string): Promise<OtpVerifyResult> {
    const key = this.key(email, purpose);
    const raw = await RedisOtpStore.getClient().get(key);
    if (!raw) return { status: "not_found" };

    const entry = JSON.parse(raw) as OtpEntry;
    const now = Date.now();
    if (now > entry.expiresAt) {
      await this.clear(email, purpose);
      return { status: "expired" };
    }
    if (entry.lockUntil && now < entry.lockUntil) {
      return { status: "too_many_attempts" };
    }
    if (!safeEqualString(code, entry.code)) {
      entry.attempts += 1;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        entry.lockUntil = now + OTP_LOCK_SECONDS * 1000;
      }
      const ttl = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      await RedisOtpStore.getClient().set(key, JSON.stringify(entry), "EX", ttl);
      return { status: entry.lockUntil ? "too_many_attempts" : "invalid" };
    }
    await this.clear(email, purpose);
    return { status: "ok" };
  }

  async clear(email: string, purpose: OtpPurpose): Promise<void> {
    await RedisOtpStore.getClient().del(this.key(email, purpose));
  }
}

let memoryFallback: MemoryOtpStore | null = null;

/**
 * 返回当前环境的 OTP 存储：配置了 REDIS_URL 用 Redis，否则降级为进程内存储。
 * 降级模式仅用于本地开发 / 单实例；生产必须配置 REDIS_URL。
 */
export function getOtpStore(): OtpStore {
  if (process.env.REDIS_URL) {
    return new RedisOtpStore();
  }
  if (!memoryFallback) {
    memoryFallback = new MemoryOtpStore();
    // eslint-disable-next-line no-console
    console.warn("[otp-store] REDIS_URL 未配置，使用进程内 OTP 存储（不适用于生产 / 多实例）。");
  }
  return memoryFallback;
}

export { generateOtpCode };
