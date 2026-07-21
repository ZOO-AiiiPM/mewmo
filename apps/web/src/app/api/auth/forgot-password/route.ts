import { getPrisma } from "@mewmo/db";
import { sendPasswordReset } from "@mewmo/email";
import { loadEnv } from "@mewmo/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { signPasswordResetToken } from "../../../../lib/password-reset";

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * 密码重置申请入口。
 *
 * 防枚举：无论 email 是否对应真实用户，都返回相同的 { ok: true }。
 * 只有 email 格式非法才返回 400。这样攻击者无法通过响应差异判断邮箱是否注册。
 *
 * 邮件链接的 host 来自请求 origin（new URL(request.url).origin），
 * 不读 env.NEXTAUTH_URL —— preview 请求来自 preview 域名，链接就指向 preview；
 * production 请求来自 zooooo.site，链接就指向生产。
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = parsed.data.email;
  const origin = new URL(request.url).origin;

  // 防枚举：所有错误路径都吞掉，统一返回 ok。
  // 若 user 不存在，不发邮件；若发信失败，记录但不暴露给客户端。
  try {
    const env = loadEnv();
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = signPasswordResetToken(
        { email: user.email, userId: user.id },
        env.NEXTAUTH_SECRET,
      );
      await sendPasswordReset(user.email, token, origin);
    }
  } catch {
    // 静默失败：防枚举优先于错误反馈。
    // 生产环境应通过外部监控（如 Vercel logs / Resend dashboard）发现发信失败。
  }

  return NextResponse.json({ ok: true });
}
