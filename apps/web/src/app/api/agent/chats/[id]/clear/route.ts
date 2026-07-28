import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";

import { auth } from "../../../../../../lib/auth";
import { agentError } from "../../../../../../lib/agent-contract";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const { id } = await params;
  const repo = createAiChatsRepository();

  const result = await repo.clearMessages(session.user.id, id) as { count?: number };
  if (!result.count) {
    return NextResponse.json(agentError("chat_not_found", "会话不存在。", false), { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
