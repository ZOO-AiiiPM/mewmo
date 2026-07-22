import { hashPassword } from "@mewmo/auth";
import { getPrisma } from "@mewmo/db";
import { loadEnv } from "@mewmo/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPasswordResetToken } from "../../../../lib/password-reset";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1),
});

const PASSWORD_MIN_LENGTH = 8;

/**
 * 密码重置执行入口。
 *
 * 与 /api/account/password（已登录改密）不同：本路由不验证旧密码，
 * 因为身份认证已通过 token（JWT 签名 + 过期校验）完成。
 *
 * 不复用 updateAccountPassword：它对有密码的用户强制验证旧密码，
 * 重置场景用户没有旧密码，会卡住。
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
  }

  const { token, newPassword, confirmPassword } = parsed.data;

  const env = loadEnv();
  const result = verifyPasswordResetToken(token, env.NEXTAUTH_SECRET);

  if (!result.ok) {
    // 过期与其他无效统一提示"链接已失效"，避免攻击者通过响应区分 token 状态
    const message = result.error === "expired" ? "链接已过期，请重新申请重置邮件" : "链接无效，请重新申请重置邮件";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 密码长度校验（在 token 校验之后，避免通过密码错误响应探测 token 有效性）
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
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { id: true },
  });

  if (!user) {
    // 用户已被删除：不暴露存在性，统一返回链接无效
    return NextResponse.json({ error: "链接无效，请重新申请重置邮件" }, { status: 400 });
  }

  const hash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });

  return NextResponse.json({ ok: true });
}
