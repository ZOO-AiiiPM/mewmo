import { NextResponse } from "next/server";
import { createFeedSchema } from "@mewmo/shared";
import { createFeedsRepository, getPrisma } from "@mewmo/db";

import { auth } from "../../../lib/auth";

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feeds = (await createFeedsRepository().findByUserIdWithUnreadCount(session.user.id)) as Array<{
    _count?: { entries?: number };
  }>;

  return NextResponse.json(
    feeds.map(({ _count, ...feed }) => ({
      ...feed,
      unreadCount: _count?.entries ?? 0,
    })),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createFeedSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const feed = await createFeedsRepository().create(session.user.id, {
      url: parsed.data.url,
      title: parsed.data.title,
      refreshInterval: parsed.data.refreshInterval,
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.favicon !== undefined && { favicon: parsed.data.favicon }),
    });
    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await getPrisma().feed.findFirst({
        where: { url: parsed.data.url, userId: session.user.id, deletedAt: null },
      });
      return NextResponse.json(existing ?? { error: "Feed already exists" }, { status: existing ? 200 : 409 });
    }
    throw error;
  }
}
