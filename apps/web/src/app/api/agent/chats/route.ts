import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../lib/auth";

const createChatSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  default: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = createAiChatsRepository();
  const chats = await repo.findByUserId(session.user.id);
  return NextResponse.json({ chats });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createChatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const repo = createAiChatsRepository();
  const chat = parsed.data.default
    ? await repo.findOrCreateDefault(session.user.id)
    : await repo.create(session.user.id, { title: parsed.data.title ?? "新会话" });

  return NextResponse.json({ chat }, { status: parsed.data.default ? 200 : 201 });
}
