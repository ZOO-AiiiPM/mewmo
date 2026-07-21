import { NextResponse } from "next/server";

import { auth } from "../../../../../lib/auth";
import { agentError } from "../../../../../lib/agent-contract";
import { proxyAgentResponse, requestAgentServer } from "../../../../../lib/agent-server-client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }
  const { id } = await params;
  return proxyAgentResponse(requestAgentServer(session.user.id, `/v1/actions/${encodeURIComponent(id)}`));
}
