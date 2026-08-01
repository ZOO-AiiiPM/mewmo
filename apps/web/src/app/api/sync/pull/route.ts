import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import {
  SYNC_CONTRACT_VERSION,
  applyPageLimit,
  buildNextCursor,
  normalizeCursor,
  syncPullSchema,
} from "@mewmo/sync";

import { resolveRequestUser } from "../../../../lib/request-user";

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = syncPullSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = user.id;
  const cursor = normalizeCursor(parsed.data.cursor);
  const limit = applyPageLimit(parsed.data.limit);
  // +1 to detect whether another page exists.
  const queryLimit = limit + 1;
  const prisma = getPrisma();

  const [notes, clips, feeds, feedEntries] = await Promise.all([
    prisma.note.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
      take: queryLimit,
    }),
    prisma.clip.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
      take: queryLimit,
    }),
    prisma.feed.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
      take: queryLimit,
    }),
    prisma.feedEntry.findMany({
      where: { userId, updatedAt: { gt: cursor } },
      orderBy: { updatedAt: "asc" },
      take: queryLimit,
    }),
  ]);

  // Trim each entity to the requested page size and report hasMore when any
  // entity still has rows beyond the page.
  const pageRecords = {
    note: notes.slice(0, limit),
    clip: clips.slice(0, limit),
    feed: feeds.slice(0, limit),
    feed_entry: feedEntries.slice(0, limit),
  };
  const truncated = {
    note: notes.length > limit,
    clip: clips.length > limit,
    feed: feeds.length > limit,
    feed_entry: feedEntries.length > limit,
  };
  const hasMore = Object.values(truncated).some(Boolean);

  // nextCursor = highest updatedAt across all fetched rows (every entity), so a
  // follow-up pull over `updatedAt > nextCursor` always makes forward progress.
  const allLatest: { updatedAt: string }[] = [
    ...notes.map((row) => ({ updatedAt: row.updatedAt.toISOString() })),
    ...clips.map((row) => ({ updatedAt: row.updatedAt.toISOString() })),
    ...feeds.map((row) => ({ updatedAt: row.updatedAt.toISOString() })),
    ...feedEntries.map((row) => ({ updatedAt: row.updatedAt.toISOString() })),
  ];
  const nextCursor = buildNextCursor(allLatest, new Date().toISOString());

  return NextResponse.json({
    contractVersion: SYNC_CONTRACT_VERSION,
    cursor: nextCursor,
    nextCursor,
    hasMore,
    limit,
    records: pageRecords,
  });
}
