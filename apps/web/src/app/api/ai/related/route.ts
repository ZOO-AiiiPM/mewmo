import { z } from "zod";
import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import { getAiWorkflowQueryService } from "../../../../lib/ai-workflow-query";

const querySchema = z.object({
  targetType: z.enum(["note", "clip", "feed_entry"]),
  targetId: z.string().min(1),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    targetType: url.searchParams.get("targetType"),
    targetId: url.searchParams.get("targetId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const items = await (await getAiWorkflowQueryService()).getRelated({ userId: session.user.id, ...parsed.data });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to load related content", error);
    return NextResponse.json({ error: "Related content unavailable" }, { status: 503 });
  }
}
