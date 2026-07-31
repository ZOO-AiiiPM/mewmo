import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../../../lib/auth";
import { agentError } from "../../../../../../lib/agent-contract";

const truncateSchema = z.object({
  turnId: z.string().min(1),
});

/**
 * Edit/regenerate fork semantics: drop the given turn and everything after it
 * so the resent message replaces the original instead of appending. The agent
 * rebuilds model context from activeLeafId, so a DB-level truncate is enough.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const parsed = truncateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(agentError("invalid_request", "轮次参数无效。", false), { status: 400 });
  }

  const { id } = await params;
  const result = await createAiChatsRepository().truncateFromTurn(session.user.id, id, parsed.data.turnId) as { count?: number };
  if (!result.count) {
    return NextResponse.json(agentError("turn_not_found", "该轮对话不存在。", false), { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
