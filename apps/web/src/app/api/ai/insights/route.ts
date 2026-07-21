import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../lib/auth";
import { getAiWorkflowQueryService } from "../../../../lib/ai-workflow-query";

const querySchema = z.object({ noteId: z.string().min(1) });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse({ noteId: new URL(request.url).searchParams.get("noteId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const insights = await (await getAiWorkflowQueryService()).getNoteInsights({ userId: session.user.id, noteId: parsed.data.noteId });
    if (!insights) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ items: insights });
  } catch (error) {
    console.error("Failed to load note insights", error);
    return NextResponse.json({ error: "Note insights unavailable" }, { status: 503 });
  }
}
