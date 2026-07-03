import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { syncPullSchema } from "@mewmo/shared";

import { auth } from "../../../../lib/auth";

function normalizeCursor(cursor?: string): Date {
  if (!cursor) return new Date(0);

  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) return new Date(0);

  return parsed;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = syncPullSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = session.user.id;
  const cursor = normalizeCursor(parsed.data.cursor);
  const nextCursor = new Date().toISOString();
  const prisma = getPrisma();

  const [notes, clips, feeds, feedEntries] = await Promise.all([
    prisma.note.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.clip.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.feed.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.feedEntry.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    cursor: nextCursor,
    records: {
      note: notes,
      clip: clips,
      feed: feeds,
      feed_entry: feedEntries,
    },
  });
}
