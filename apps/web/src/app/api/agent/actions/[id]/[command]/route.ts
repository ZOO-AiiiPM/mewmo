import { NextResponse } from "next/server";

import { auth } from "../../../../../../lib/auth";
import { agentActionCommandSchema, agentError } from "../../../../../../lib/agent-contract";
import { proxyAgentResponse, requestAgentServer } from "../../../../../../lib/agent-server-client";

const commands = ["confirm", "cancel", "retry"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const { id, command } = await params;
  if (!commands.includes(command as (typeof commands)[number])) {
    return NextResponse.json(agentError("unsupported_action", "不支持的操作。", false), { status: 404 });
  }

  const parsed = agentActionCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(agentError("invalid_request", "操作参数无效。", false), { status: 400 });
  }

  return proxyAgentResponse(
    requestAgentServer(session.user.id, `/v1/actions/${encodeURIComponent(id)}/${command}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        command === "cancel"
          ? {}
          : { executionMode: parsed.data.executionMode ?? "server" },
      ),
    }),
  );
}
