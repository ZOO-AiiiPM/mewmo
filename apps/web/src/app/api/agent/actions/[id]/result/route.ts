import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../../../lib/auth";
import { agentError } from "../../../../../../lib/agent-contract";
import { proxyAgentResponse, requestAgentServer } from "../../../../../../lib/agent-server-client";

const resultSchema = z.object({
  clientRequestId: z.string().min(8).max(128),
  status: z.enum(["succeeded", "failed"]),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }
  const parsed = resultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(agentError("invalid_request", "执行结果参数无效。", false), { status: 400 });
  }
  const { id } = await params;
  return proxyAgentResponse(
    requestAgentServer(session.user.id, `/v1/actions/${encodeURIComponent(id)}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: parsed.data.status,
        ...(parsed.data.result ? { result: parsed.data.result } : {}),
        ...(parsed.data.error ? { error: `${parsed.data.error.code}: ${parsed.data.error.message}` } : {}),
      }),
    }),
  );
}
