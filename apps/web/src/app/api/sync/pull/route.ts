import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import {
  SYNC_CONTRACT_VERSION,
  SYNC_ERROR_CONTRACT_UNSUPPORTED,
  afterPositionPredicate,
  applyPageLimit,
  contractVersionSupported,
  decodePageCursor,
  encodePageCursor,
  paginateEntities,
  syncPullSchema,
  type SyncEntity,
} from "@mewmo/sync";

import { resolveRequestUser } from "../../../../lib/request-user";

type Row = { id: string; updatedAt: Date };

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = syncPullSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { contractVersion, cursor, limit: rawLimit } = parsed.data;
  if (!contractVersionSupported(contractVersion)) {
    return NextResponse.json(
      {
        error: SYNC_ERROR_CONTRACT_UNSUPPORTED,
        message: `Server supports contract version ${SYNC_CONTRACT_VERSION}`,
        supportedContractVersion: SYNC_CONTRACT_VERSION,
      },
      { status: 426 },
    );
  }

  const userId = user.id;
  const limit = applyPageLimit(rawLimit);
  const queryLimit = limit + 1; // extra row detects hasMore, is never returned
  const prisma = getPrisma();

  const positions = decodePageCursor(cursor);

  const findMany = (
    entity: SyncEntity,
    delegate: { findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown>; take: number }): Promise<Row[]> },
  ) =>
    delegate.findMany({
      where: { userId, ...afterPositionPredicate(positions[entity]) },
      orderBy: { updatedAt: "asc", id: "asc" },
      take: queryLimit,
    });

  const [notes, clips, feeds, feedEntries] = await Promise.all([
    findMany("note", prisma.note),
    findMany("clip", prisma.clip),
    findMany("feed", prisma.feed),
    findMany("feed_entry", prisma.feedEntry),
  ]);

  const page = paginateEntities<Row>(
    { note: notes, clip: clips, feed: feeds, feed_entry: feedEntries },
    limit,
    positions,
  );

  const nextCursor = encodePageCursor(page.nextState) ?? "";

  return NextResponse.json({
    contractVersion: SYNC_CONTRACT_VERSION,
    cursor: nextCursor,
    nextCursor,
    hasMore: page.hasMore,
    limit,
    records: page.records,
  });
}
