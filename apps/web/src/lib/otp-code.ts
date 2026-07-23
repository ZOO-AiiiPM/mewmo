import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * 生成 6 位邮箱验证码（000000-999999，零填充）。
 * 使用 crypto.randomInt 保证密码学安全，避免 Math.random 的可预测性。
 */
export function generateOtpCode(): string {
  const value = randomInt(0, 1_000_000);
  return value.toString().padStart(6, "0");
}

/**
 * 时序安全的字符串比较，防止通过响应时间差异爆破验证码。
 * 长度不同直接返回 false（不泄露长度信息）。
 */
export function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
