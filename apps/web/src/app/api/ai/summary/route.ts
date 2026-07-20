import { getPrisma } from "@mewmo/db";
import { z } from "zod";
import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import { enqueueSummaryRun } from "../../../../lib/ai-run-enqueue";

const summaryRequestSchema = z.object({
  targetType: z.enum(["clip", "feed_entry"]),
  targetId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = summaryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const prisma = getPrisma();
  const { targetId, targetType } = parsed.data;
  const target = targetType === "clip"
    ? await prisma.clip.findFirst({
        where: { id: targetId, userId: session.user.id, deletedAt: null },
        select: { id: true, version: true },
      })
    : await prisma.feedEntry.findFirst({
        where: { id: targetId, userId: session.user.id, deletedAt: null },
        select: { id: true, version: true },
      });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const run = await enqueueSummaryRun({
      userId: session.user.id,
      targetType,
      targetId: target.id,
      inputVersion: target.version,
      manual: true,
    });
    return NextResponse.json({ runId: run.id, status: "queued" }, { status: 202 });
  } catch (error) {
    console.error("Failed to enqueue AI summary run", error);
    return NextResponse.json({ error: "Summary workflow unavailable" }, { status: 503 });
  }
}
