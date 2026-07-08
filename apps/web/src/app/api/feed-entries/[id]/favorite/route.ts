import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
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
  const prisma = getPrisma();
  const entry = await prisma.feedEntry.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    include: {
      feed: { select: { title: true, favicon: true } },
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.clip.findFirst({
    where: { userId: session.user.id, url: entry.url, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      isFavorited: true,
      created: false,
      clip: existing,
    });
  }

  const clip = await prisma.clip.create({
    data: {
      userId: session.user.id,
      url: entry.url,
      title: entry.title,
      content: entry.content,
      summary: entry.summary,
      favicon: entry.feed.favicon,
      coverImage: entry.coverImage,
      excerpt: entry.excerpt,
      sourceName: entry.sourceName ?? entry.feed.title,
      author: entry.author,
      publishedAt: entry.publishedAt,
    },
  });

  try {
    await createQueueHelpers().addSummaryJob({
      userId: session.user.id,
      targetId: clip.id,
      targetType: "clip",
    });
  } catch (error) {
    console.error("Failed to enqueue feed clip summary job", error);
  }

  return NextResponse.json(
    { ok: true, isFavorited: true, created: true, clip },
    { status: 201 },
  );
}
