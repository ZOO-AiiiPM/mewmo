import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { createQueueHelpers } from "@mewmo/queue";
import { createClipSchema } from "@mewmo/shared";
import { auth } from "../../../lib/auth";
import { fetchClipFromUrl } from "../../../lib/clip-fetch";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const clips = await prisma.clip.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      url: true,
      title: true,
      content: true,
      summary: true,
      favicon: true,
      coverImage: true,
      excerpt: true,
      sourceName: true,
      author: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(clips);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const fetched = await fetchClipFromUrl(parsed.data.url).catch(() => null);
  const data: Prisma.ClipUncheckedCreateInput = {
    userId: session.user.id,
    url: parsed.data.url,
    title: fetched?.title ?? parsed.data.title,
    content: fetched?.content ?? parsed.data.content,
    summary: fetched?.summary ?? parsed.data.summary ?? null,
    favicon: fetched?.favicon ?? parsed.data.favicon ?? null,
    coverImage: fetched?.coverImage ?? parsed.data.coverImage ?? null,
    excerpt: fetched?.excerpt ?? parsed.data.excerpt ?? null,
    sourceName: fetched?.sourceName ?? parsed.data.sourceName ?? null,
    author: fetched?.author ?? parsed.data.author ?? null,
    publishedAt: fetched?.publishedAt ?? parsed.data.publishedAt ?? null,
  };

  const prisma = getPrisma();
  const clip = await prisma.clip.create({
    data,
  });
  if (typeof clip.id === "string") {
    try {
      await createQueueHelpers().addSummaryJob({ userId: session.user.id, targetId: clip.id, targetType: "clip" });
    } catch (error) {
      console.error("Failed to enqueue clip summary job", error);
    }
  }

  return NextResponse.json(clip, { status: 201 });
}
