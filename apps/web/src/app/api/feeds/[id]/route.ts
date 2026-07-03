import { NextResponse } from "next/server";
import { updateFeedSchema } from "@mewmo/shared";
import { getPrisma } from "@mewmo/db";

import { auth } from "../../../../lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const feed = await getPrisma().feed.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(feed);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = updateFeedSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feed", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.feed.update({
    where: { id },
    data: {
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.favicon !== undefined && { favicon: parsed.data.favicon }),
      ...(parsed.data.refreshInterval !== undefined && { refreshInterval: parsed.data.refreshInterval }),
      version: { increment: 1 },
    },
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
  const feed = await prisma.feed.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.feed.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
