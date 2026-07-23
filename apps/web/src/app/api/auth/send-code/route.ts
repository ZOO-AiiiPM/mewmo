import { NextResponse } from "next/server";
import { z } from "zod";

import { requestOtp } from "../../../../lib/otp-request";

const bodySchema = z.object({ email: z.string().email() });

/**
 * 注册验证码申请入口。
 * 校验邮箱格式 → 重发冷却 60s → 邮箱已存在则 409 → 否则生成并发送 6 位验证码。
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email } = parsed.data;
  const outcome = await requestOtp(email, "register", { allowExisting: false });

  if (!outcome.ok) {
    if (outcome.status === 429) {
      return NextResponse.json({ error: "验证码发送过于频繁，请稍后再试" }, { status: 429 });
    }
    if (outcome.status === 409) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true });
}
