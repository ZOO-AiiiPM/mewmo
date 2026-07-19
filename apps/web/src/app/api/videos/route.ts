import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { createQueueHelpers } from "@mewmo/queue";
import { createVideoSchema } from "@mewmo/shared";

import { auth } from "../../../lib/auth";
import { parseSupportedVideoUrl } from "../../../lib/video-url";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createVideoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid video URL", issues: parsed.error.issues }, { status: 400 });
  }

  const supported = parseSupportedVideoUrl(parsed.data.url);
  if (!supported) {
    return NextResponse.json(
      { error: "Currently only single Bilibili video URLs are supported" },
      { status: 422 },
    );
  }

  const userId = session.user.id;
  const prisma = getPrisma();
  const created = await prisma.$transaction(async (tx) => {
    const feed = await tx.feed.upsert({
      where: {
        userId_url_type: {
          userId,
          url: supported.feedUrl,
          type: "video",
        },
      },
      create: {
        userId,
        url: supported.feedUrl,
        type: "video",
        title: supported.feedTitle,
      },
      update: {
        deletedAt: null,
        title: supported.feedTitle,
        version: { increment: 1 },
      },
    });

    const entry = await tx.feedEntry.upsert({
      where: {
        feedId_url: {
          feedId: feed.id,
          url: supported.canonicalUrl,
        },
      },
      create: {
        userId,
        feedId: feed.id,
        title: supported.externalVideoId,
        url: supported.canonicalUrl,
        content: "",
        sourceName: "哔哩哔哩",
      },
      update: {
        deletedAt: null,
        version: { increment: 1 },
      },
    });

    const videoDetail = await tx.videoDetail.upsert({
      where: { feedEntryId: entry.id },
      create: {
        feedEntryId: entry.id,
        platform: supported.platform,
        externalVideoId: supported.externalVideoId,
      },
      update: {
        platform: supported.platform,
        externalVideoId: supported.externalVideoId,
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

    return { entry, videoDetail };
  });

  try {
    await createQueueHelpers().addVideoMetadataJob({
      userId,
      feedEntryId: created.entry.id,
      revision: created.videoDetail.analysisVersion,
    });
  } catch (error) {
    await prisma.videoDetail.updateMany({
      where: {
        feedEntryId: created.entry.id,
        analysisVersion: created.videoDetail.analysisVersion,
        feedEntry: { userId, deletedAt: null },
      },
      data: {
        processingStatus: "failed",
        processingError: "queue: video metadata job could not be enqueued",
        lastProcessedAt: new Date(),
      },
    });
    console.error("Failed to enqueue video metadata job", error);
    return NextResponse.json(
      { error: "Video processing is temporarily unavailable", entryId: created.entry.id },
      { status: 503 },
    );
  }

  return NextResponse.json(created, { status: 202 });
}
