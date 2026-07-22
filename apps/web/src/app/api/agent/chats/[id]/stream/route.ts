import { NextResponse } from "next/server";

import { auth } from "../../../../../../lib/auth";
import { agentError, agentMessageRequestSchema } from "../../../../../../lib/agent-contract";
import { proxyAgentStream, requestAgentServer } from "../../../../../../lib/agent-server-client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  const parsed = agentMessageRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(agentError("invalid_request", "消息或上下文参数无效。", false), { status: 400 });
  const { id } = await params;
  const context = parsed.data.context;
  if (context?.resource.type === "knowledge_base") return NextResponse.json(agentError("invalid_request", "Agent 暂不支持将知识库本身作为对话正文上下文。", false), { status: 400 });
  return proxyAgentStream(requestAgentServer(session.user.id, `/v1/chats/${encodeURIComponent(id)}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      clientRequestId: parsed.data.clientRequestId,
      content: parsed.data.content,
      skillId: parsed.data.skillId,
      context: context ? { targetType: context.resource.type, targetId: context.resource.id, ...(context.draft ? { draft: context.draft } : {}) } : null,
    }),
  }));
}
