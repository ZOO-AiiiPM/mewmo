import { hashPassword, verifyPassword } from "@mewmo/auth";
import { getPrisma } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AccountPasswordError,
  updateAccountPassword,
} from "../../../../lib/account-password";
import { auth } from "../../../../lib/auth";

const updatePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

const errorResponses = {
  CURRENT_PASSWORD_REQUIRED: {
    status: 400,
    error: "请输入当前密码",
    field: "currentPassword",
  },
  CURRENT_PASSWORD_INCORRECT: {
    status: 400,
    error: "当前密码不正确",
    field: "currentPassword",
  },
  PASSWORD_TOO_SHORT: {
    status: 400,
    error: "新密码至少需要 8 位",
    field: "newPassword",
  },
  PASSWORD_CONFIRMATION_MISMATCH: {
    status: 400,
    error: "两次输入的新密码不一致",
    field: "confirmPassword",
  },
  PASSWORD_UNCHANGED: {
    status: 400,
    error: "新密码不能与当前密码相同",
    field: "newPassword",
  },
  USER_NOT_FOUND: {
    status: 404,
    error: "未找到账户",
  },
} as const;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = updatePasswordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = {
    newPassword: parsed.data.newPassword,
    confirmPassword: parsed.data.confirmPassword,
    ...(parsed.data.currentPassword === undefined
      ? {}
      : { currentPassword: parsed.data.currentPassword }),
  };
  const prisma = getPrisma();

  try {
    const result = await updateAccountPassword(
      session.user.id,
      input,
      {
        async findPassword(userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { password: true },
          });
          return user?.password;
        },
        verifyPassword,
        hashPassword,
        async updatePassword(userId, hash) {
          await prisma.user.update({
            where: { id: userId },
            data: { password: hash },
          });
        },
      },
    );

    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    if (!(error instanceof AccountPasswordError)) {
      throw error;
    }

    const { status, ...body } = errorResponses[error.code];
    return NextResponse.json(body, { status });
  }
}
