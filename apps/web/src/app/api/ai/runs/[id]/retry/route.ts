import { NextResponse } from "next/server";

import { auth } from "../../../../../../lib/auth";
import { getAiWorkflowQueryService } from "../../../../../../lib/ai-workflow-query";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const run = await (await getAiWorkflowQueryService()).retryRun({ userId: session.user.id, runId: id });
    return NextResponse.json({ runId: run.id, status: run.status ?? "queued" }, { status: 202 });
  } catch (error) {
    console.error("Failed to retry AI workflow run", error);
    return NextResponse.json({ error: "Workflow retry unavailable" }, { status: 503 });
  }
}
