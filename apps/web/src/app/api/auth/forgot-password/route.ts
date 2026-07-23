import { NextResponse } from "next/server";
import { z } from "zod";

import { requestOtp } from "../../../../lib/otp-request";

const bodySchema = z.object({ email: z.string().email() });

/**
 * 密码重置申请入口（改为发送验证码，不再发魔法链接）。
 *
 * 防枚举：无论邮箱是否注册，都返回 { ok: true }；仅当邮箱存在才发码。
 * 重发冷却 60s 由 requestOtp 内部处理。
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email } = parsed.data;
  const outcome = await requestOtp(email, "reset", { allowExisting: true });

  if (!outcome.ok && outcome.status === 429) {
    return NextResponse.json({ error: "验证码发送过于频繁，请稍后再试" }, { status: 429 });
  }

  return NextResponse.json({ ok: true });
}
