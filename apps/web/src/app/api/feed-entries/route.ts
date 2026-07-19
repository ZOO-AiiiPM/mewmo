import { NextResponse } from "next/server";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { feedTypeSchema } from "@mewmo/shared";

import { auth } from "../../../lib/auth";

interface FeedEntryWithId {
  id: string;
  url: string;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const feedId = params.get("feedId");
  const typeParam = params.get("type") ?? "article";
  const parsedType = feedTypeSchema.safeParse(typeParam);
  if (!parsedType.success) {
    return NextResponse.json({ error: "Invalid feed type" }, { status: 400 });
  }

  if (feedId) {
    const feed = await getPrisma().feed.findFirst({
      where: { id: feedId, userId: session.user.id, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!feed || feed.type !== parsedType.data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const entries = (await createFeedEntriesRepository().findByFeedId(
      session.user.id,
      feedId,
    )) as FeedEntryWithId[];
    const withFavorites = await withFavoriteState(session.user.id, entries);
    return NextResponse.json(
      parsedType.data === "video"
        ? await withVideoState(session.user.id, withFavorites)
        : withFavorites,
    );
  }

  const entries = (await createFeedEntriesRepository().findByUserFeedType(
    session.user.id,
    parsedType.data,
  )) as FeedEntryWithId[];
  const withFavorites = await withFavoriteState(session.user.id, entries);
  return NextResponse.json(
    parsedType.data === "video"
      ? await withVideoState(session.user.id, withFavorites)
      : withFavorites,
  );
}

async function withFavoriteState<T extends FeedEntryWithId>(
  userId: string,
  entries: T[],
) {
  if (entries.length === 0) return entries.map((entry) => ({ ...entry, isFavorited: false }));

  const clips = await getPrisma().clip.findMany({
    where: {
      userId,
      deletedAt: null,
      url: { in: entries.map((entry) => entry.url) },
    },
    select: { url: true },
  });
  const favoriteUrls = new Set(clips.map((clip) => clip.url));

  return entries.map((entry) => ({
    ...entry,
    isFavorited: favoriteUrls.has(entry.url),
  }));
}

async function withVideoState<T extends FeedEntryWithId>(userId: string, entries: T[]) {
  if (entries.length === 0) return entries;
  const ids = entries.map((entry) => entry.id);
  const prisma = getPrisma();
  const [details, taggables] = await Promise.all([
    prisma.videoDetail.findMany({
      where: {
        feedEntryId: { in: ids },
        feedEntry: {
          userId,
          deletedAt: null,
          feed: { userId, deletedAt: null, type: "video" },
        },
      },
    }),
    prisma.taggable.findMany({
      where: {
        taggableId: { in: ids },
        taggableType: "feed_entry",
        tag: { userId, deletedAt: null },
      },
      include: { tag: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const detailByEntry = new Map(details.map((detail) => [detail.feedEntryId, detail]));
  const tagsByEntry = new Map<string, typeof taggables>();
  for (const taggable of taggables) {
    const current = tagsByEntry.get(taggable.taggableId) ?? [];
    current.push(taggable);
    tagsByEntry.set(taggable.taggableId, current);
  }

  return entries.map((entry) => ({
    ...entry,
    videoDetail: detailByEntry.get(entry.id) ?? null,
    tags: (tagsByEntry.get(entry.id) ?? []).map((taggable) => taggable.tag),
  }));
}
