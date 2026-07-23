import { ONBOARDING_NOTES, ensureOnboardingNotes, getPrisma } from "@mewmo/db";
import { hashPassword } from "@mewmo/auth";
import { NextResponse } from "next/server";

import { getOtpStore, otpVerifyErrorMessage } from "../../../lib/otp-store";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, name, code } = body as {
    email?: string;
    password?: string;
    name?: string;
    code?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "请输入 6 位邮箱验证码" }, { status: 400 });
  }

  // 先校验验证码（证明对邮箱的掌控），再创建账号
  const store = getOtpStore();
  const verifyResult = await store.verify(email, "register", code);
  if (verifyResult.status !== "ok") {
    return NextResponse.json({ error: otpVerifyErrorMessage(verifyResult.status) }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Account already exists" }, { status: 409 });
  }

  const hashed = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        password: hashed,
        name: name || null,
        provider: "credentials",
        emailVerified: new Date(),
      },
    });
    await ensureOnboardingNotes(tx, created.id);
    return created;
  });

  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      callbackUrl: `/notes/${ONBOARDING_NOTES[0]!.slug}`,
    },
    { status: 201 },
  );
}
