import { z } from "zod";
import { NextResponse } from "next/server";

import { auth } from "../../../../../lib/auth";
import { getAiWorkflowQueryService } from "../../../../../lib/ai-workflow-query";

const requestSchema = z.object({
  text: z.string().min(1).max(50_000),
  contentHash: z.string().min(8).max(128),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await (await getAiWorkflowQueryService()).queryRelated({
      userId: session.user.id,
      text: parsed.data.text,
      contentHash: parsed.data.contentHash,
      limit: parsed.data.limit ?? 5,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to query related content", error);
    return NextResponse.json({ error: "Related query unavailable" }, { status: 503 });
  }
}
