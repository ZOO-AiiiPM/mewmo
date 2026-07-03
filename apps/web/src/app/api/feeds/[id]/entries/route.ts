import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";

import { auth } from "../../../../../lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const entries = await prisma.feedEntry.findMany({
    where: { feedId: id, userId: session.user.id, deletedAt: null },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(entries);
}
