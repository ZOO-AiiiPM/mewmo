import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";

import { auth } from "../../../../lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const entry = await getPrisma().feedEntry.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    include: { feed: { select: { id: true, title: true, url: true } } },
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
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
    include: { feed: { select: { id: true, title: true, url: true } } },
  });

  return NextResponse.json(updated);
}
