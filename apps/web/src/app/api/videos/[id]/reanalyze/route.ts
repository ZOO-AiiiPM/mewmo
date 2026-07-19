import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { createQueueHelpers } from "@mewmo/queue";

import { auth } from "../../../../../lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const prisma = getPrisma();
  const owned = await prisma.videoDetail.findFirst({
    where: {
      feedEntryId: id,
      feedEntry: {
        userId,
        deletedAt: null,
        feed: { userId, deletedAt: null, type: "video" },
      },
    },
    select: { feedEntryId: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const videoDetail = await prisma.videoDetail.update({
    where: { feedEntryId: id },
    data: {
      processingStatus: "fetching_metadata",
      processingError: null,
      processingAttempts: 0,
      transcript: Prisma.DbNull,
      transcriptLanguage: null,
      quickJudgment: Prisma.DbNull,
      keyPoints: Prisma.DbNull,
      targetAudience: null,
      chapters: Prisma.DbNull,
      aiHighlights: Prisma.DbNull,
      suggestedTags: Prisma.DbNull,
      lastProcessedAt: null,
      analysisVersion: { increment: 1 },
    },
  });

  try {
    await createQueueHelpers().addVideoMetadataJob({
      userId,
      feedEntryId: id,
      revision: videoDetail.analysisVersion,
      force: true,
    });
  } catch (error) {
    await prisma.videoDetail.updateMany({
      where: { feedEntryId: id, analysisVersion: videoDetail.analysisVersion },
      data: {
        processingStatus: "failed",
        processingError: "queue: video metadata job could not be enqueued",
        lastProcessedAt: new Date(),
      },
    });
    console.error("Failed to enqueue video reanalysis job", error);
    return NextResponse.json({ error: "Video processing is temporarily unavailable" }, { status: 503 });
  }

  return NextResponse.json({ videoDetail }, { status: 202 });
}
