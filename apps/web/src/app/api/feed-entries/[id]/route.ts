import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";

import { auth } from "../../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../../lib/server-timing";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const { id } = await params;
  const entry = await timing.measure("db", () => getPrisma().feedEntry.findFirst({
    where: { id, userId, deletedAt: null },
    include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
  }));

  if (!entry) {
    return attachServerTiming(NextResponse.json({ error: "Not found" }, { status: 404 }), timing);
  }

  const favorite = await timing.measure("db", () => getPrisma().clip.findFirst({
    where: {
      userId,
      deletedAt: null,
      url: entry.url,
    },
    select: { id: true },
  }));

  return attachServerTiming(NextResponse.json({ ...entry, isFavorited: Boolean(favorite) }), timing);
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
