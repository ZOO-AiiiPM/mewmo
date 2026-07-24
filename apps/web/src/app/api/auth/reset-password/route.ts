import { hashPassword } from "@mewmo/auth";
import { getPrisma } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOtpStore, otpVerifyErrorMessage } from "../../../../lib/otp-store";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1),
});

const PASSWORD_MIN_LENGTH = 8;

/**
 * 密码重置执行入口（改为验证码校验，不再用 JWT token）。
 *
 * 验证码校验通过即证明对邮箱的所有权，按 email 定位用户改密。
 * 不复用 updateAccountPassword：它对有密码的用户强制验证旧密码，重置场景无旧密码。
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
  }

  const { email, code, newPassword, confirmPassword } = parsed.data;

  // 先校验验证码（在密码强度校验之前，避免通过密码错误响应探测验证码有效性）
  const store = getOtpStore();
  const verifyResult = await store.verify(email, "reset", code);
  if (verifyResult.status !== "ok") {
    return NextResponse.json({ error: otpVerifyErrorMessage(verifyResult.status) }, { status: 400 });
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `新密码至少需要 ${PASSWORD_MIN_LENGTH} 位`, field: "newPassword" },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "两次输入的新密码不一致", field: "confirmPassword" },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    // 验证码已通过却找不到用户：极小概率的删除竞态，统一报错不暴露存在性
    return NextResponse.json({ error: "重置失败，请重新申请" }, { status: 400 });
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });

  return NextResponse.json({ ok: true });
}
