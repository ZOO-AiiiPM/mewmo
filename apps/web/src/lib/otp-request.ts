import { getPrisma } from "@mewmo/db";
import { sendOtp } from "@mewmo/email";

import { generateOtpCode } from "./otp-code";
import { getOtpStore, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, type OtpPurpose } from "./otp-store";

export type RequestOtpOutcome =
  | { ok: true }
  | { ok: false; status: 429 | 409 };

/**
 * 申请并发送邮箱验证码的统一入口。
 *
 * - 重发冷却：同一邮箱 60s 内只能发一次（429）。
 * - 注册场景（allowExisting=false）：邮箱已存在直接 409 拒绝；不存在才发码。
 * - 重置场景（allowExisting=true）：防枚举——邮箱不存在时静默返回 ok，不发码。
 *
 * 发信失败静默处理（防枚举优先于错误反馈），生产环境依赖外部监控发现。
 */
export async function requestOtp(
  email: string,
  purpose: OtpPurpose,
  options: { allowExisting: boolean },
): Promise<RequestOtpOutcome> {
  const store = getOtpStore();

  const existing = await store.peek(email, purpose);
  if (existing && Date.now() - existing.sentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, status: 429 };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });

  // 注册场景：邮箱已注册则拒绝
  if (user && !options.allowExisting) {
    return { ok: false, status: 409 };
  }

  // 注册：邮箱可用（user 为 null）才发；重置：邮箱存在才发
  const shouldSend = options.allowExisting ? Boolean(user) : !user;
  if (shouldSend) {
    const code = generateOtpCode();
    await store.save(email, purpose, code, OTP_TTL_SECONDS);
    try {
      await sendOtp(email, code, purpose);
    } catch {
      // 发信失败静默，生产靠监控（Resend dashboard / Vercel logs）发现
    }
  }

  return { ok: true };
}
