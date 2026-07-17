import { NextResponse } from "next/server";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { feedTypeSchema } from "@mewmo/shared";

import { auth } from "../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../lib/server-timing";

interface FeedEntryWithId {
  id: string;
  url: string;
}

export async function GET(request: Request) {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const params = new URL(request.url).searchParams;
  const feedId = params.get("feedId");
  const typeParam = params.get("type") ?? "article";
  const parsedType = feedTypeSchema.safeParse(typeParam);
  if (!parsedType.success) {
    return attachServerTiming(NextResponse.json({ error: "Invalid feed type" }, { status: 400 }), timing);
  }

  const response = await timing.measure("db", async () => {
    if (feedId) {
      const feed = await getPrisma().feed.findFirst({
        where: { id: feedId, userId, deletedAt: null },
        select: { id: true, type: true },
      });
      if (!feed || feed.type !== parsedType.data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const entries = (await createFeedEntriesRepository().findByFeedId(
        userId,
        feedId,
      )) as FeedEntryWithId[];
      return NextResponse.json(await withFavoriteState(userId, entries));
    }

    const entries = (await createFeedEntriesRepository().findByUserFeedType(
      userId,
      parsedType.data,
    )) as FeedEntryWithId[];
    return NextResponse.json(await withFavoriteState(userId, entries));
  });

  return attachServerTiming(response, timing);
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
