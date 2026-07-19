import { NextResponse } from "next/server";
import { createVideosRepository, getPrisma } from "@mewmo/db";

import { auth } from "../../../../lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const entry = await getPrisma().feedEntry.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (entry.feed.type === "video") {
    const prisma = getPrisma();
    const [videoDetail, taggables, favorite] = await Promise.all([
      createVideosRepository().findDetail(session.user.id, id),
      prisma.taggable.findMany({
        where: {
          taggableId: id,
          taggableType: "feed_entry",
          tag: { userId: session.user.id, deletedAt: null },
        },
        include: { tag: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.clip.findFirst({
        where: { userId: session.user.id, deletedAt: null, url: entry.url },
        select: { id: true },
      }),
    ]);

    return NextResponse.json({
      ...entry,
      videoDetail,
      tags: taggables.map((taggable) => taggable.tag),
      isFavorited: Boolean(favorite),
    });
  }

  const favorite = await getPrisma().clip.findFirst({
    where: {
      userId: session.user.id,
      deletedAt: null,
      url: entry.url,
    },
    select: { id: true },
  });

  return NextResponse.json({ ...entry, isFavorited: Boolean(favorite) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { read?: unknown };
  if (typeof body.read !== "boolean") {
    return NextResponse.json({ error: "Invalid read state" }, { status: 400 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const entry = await prisma.feedEntry.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.feedEntry.update({
    where: { id },
    data: {
      readAt: body.read ? new Date() : null,
      version: { increment: 1 },
    },
    include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const entry = await prisma.feedEntry.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    include: { feed: { select: { type: true } } },
  });

  if (!entry || entry.feed.type !== "video") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.feedEntry.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
