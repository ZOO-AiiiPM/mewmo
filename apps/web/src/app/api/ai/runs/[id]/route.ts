import { NextResponse } from "next/server";

import { auth } from "../../../../../lib/auth";
import { getAiWorkflowQueryService } from "../../../../../lib/ai-workflow-query";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const run = await (await getAiWorkflowQueryService()).getRun({ userId: session.user.id, runId: id });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) {
    console.error("Failed to load AI workflow run", error);
    return NextResponse.json({ error: "Workflow status unavailable" }, { status: 503 });
  }
}
