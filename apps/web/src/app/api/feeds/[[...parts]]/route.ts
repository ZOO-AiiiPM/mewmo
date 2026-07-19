import { NextResponse } from "next/server";
import { createFeedSchema, discoverFeedSchema, feedTypeSchema, updateFeedSchema } from "@mewmo/shared";
import { createFeedEntriesRepository, createFeedsRepository, getPrisma } from "@mewmo/db";

import { auth } from "../../../../lib/auth";
import { discoverFeeds, FeedSearchProviderNotConfiguredError } from "../../../../lib/feed-discovery";
import { fetchInitialFeed, type InitialFeedRecord } from "../../../../lib/feed-initial-fetch";
import { requestFeedRefresh } from "../../../../lib/feed-refresh-request";

interface FeedRouteParams {
  parts?: string[];
}

function pathParts(params: FeedRouteParams) {
  return params.parts ?? [];
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function requireFeed(userId: string, id: string) {
  return getPrisma().feed.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

export async function GET(request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const parts = pathParts(await params);
  if (parts.length === 0) {
    const typeParam = new URL(request.url).searchParams.get("type");
    const parsedType = typeParam ? feedTypeSchema.safeParse(typeParam) : null;
    if (parsedType && !parsedType.success) {
      return NextResponse.json({ error: "Invalid feed type" }, { status: 400 });
    }

    const feeds = (await createFeedsRepository().findByUserIdWithUnreadCount(userId, parsedType?.data)) as Array<{
      _count?: { entries?: number };
    }>;

    return NextResponse.json(
      feeds.map(({ _count, ...feed }) => ({
        ...feed,
        unreadCount: _count?.entries ?? 0,
      })),
    );
  }

  const [id, action] = parts;
  if (!id || parts.length > 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const feed = await requireFeed(userId, id);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!action) return NextResponse.json(feed);
  if (action === "entries") {
    return NextResponse.json(await createFeedEntriesRepository().findByFeedId(userId, id));
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const parts = pathParts(await params);
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  if (parts.length === 0) {
    const parsed = createFeedSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid feed", issues: parsed.error.issues }, { status: 400 });
    }

    try {
      const feedsRepository = createFeedsRepository();
      await feedsRepository.purgeDeletedDuplicate(userId, parsed.data.url, parsed.data.type);
      const feed = await feedsRepository.create(userId, {
        url: parsed.data.url,
        type: parsed.data.type,
        title: parsed.data.title,
        refreshInterval: parsed.data.refreshInterval,
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description,
        }),
        ...(parsed.data.favicon !== undefined && {
          favicon: parsed.data.favicon,
        }),
      });
      const feedRecord = feed as Record<string, unknown> & InitialFeedRecord;
      const initialFetch = await fetchInitialFeed(userId, feedRecord, {
        limit: parsed.data.initialEntryLimit,
      });
      return NextResponse.json(
        {
          ...feedRecord,
          lastFetchedAt: initialFetch.completedAt ?? null,
          lastFetchStartedAt: null,
          lastFetchStatus: initialFetch.status,
          lastFetchError: initialFetch.error ?? null,
          lastFetchCount: initialFetch.created,
          existing: false,
          initialFetch,
        },
        { status: 201 },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await getPrisma().feed.findFirst({
          where: { url: parsed.data.url, userId, type: parsed.data.type, deletedAt: null },
        });
        if (!existing) {
          return NextResponse.json({ error: "Feed already exists" }, { status: 409 });
        }
        const shouldRetry = existing.lastFetchStatus === "error" || existing.lastFetchStatus === "partial";
        const refresh = shouldRetry
          ? await requestFeedRefresh(userId, existing.id)
          : { queued: existing.lastFetchStatus === "queued" || existing.lastFetchStatus === "fetching", status: existing.lastFetchStatus };
        return NextResponse.json(
          {
            ...existing,
            lastFetchStartedAt: refresh.status === "queued" ? null : existing.lastFetchStartedAt,
            lastFetchStatus: refresh.status,
            existing: true,
          },
          { status: 200 },
        );
      }
      throw error;
    }
  }

  if (parts.length === 1 && parts[0] === "discover") {
    const parsed = discoverFeedSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
    }

    try {
      return NextResponse.json({
        results: await discoverFeeds(parsed.data.query),
      });
    } catch (error) {
      if (error instanceof FeedSearchProviderNotConfiguredError) {
        return NextResponse.json({ error: "Feed search provider is not configured" }, { status: 503 });
      }
      throw error;
    }
  }

  if (parts.length === 1 && parts[0] === "refresh") {
    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type");
    const parsedType = typeParam ? feedTypeSchema.safeParse(typeParam) : null;
    if (parsedType && !parsedType.success) {
      return NextResponse.json({ error: "Invalid feed type" }, { status: 400 });
    }

    const feeds = await getPrisma().feed.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(parsedType?.data ? { type: parsedType.data } : {}),
      },
      select: { id: true },
    });

    const queued = (await Promise.all(feeds.map((feed) => requestFeedRefresh(userId, feed.id)))).filter((result) => result.queued).length;
    return NextResponse.json({ checked: feeds.length, queued });
  }

  if (parts.length === 2 && parts[1] === "refresh") {
    const feed = await requireFeed(userId, parts[0]!);
    if (!feed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const refresh = await requestFeedRefresh(userId, feed.id);
    return NextResponse.json(refresh, { status: refresh.queued ? 202 : 409 });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parts = pathParts(await params);
  if (parts.length !== 1 || !parts[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = updateFeedSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feed", issues: parsed.error.issues }, { status: 400 });
  }

  const feed = await requireFeed(session.user.id, parts[0]);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await getPrisma().feed.update({
    where: { id: parts[0] },
    data: {
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && {
        description: parsed.data.description,
      }),
      ...(parsed.data.favicon !== undefined && {
        favicon: parsed.data.favicon,
      }),
      ...(parsed.data.refreshInterval !== undefined && {
        refreshInterval: parsed.data.refreshInterval,
      }),
      version: { increment: 1 },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parts = pathParts(await params);
  if (parts.length !== 1 || !parts[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await createFeedsRepository().delete(session.user.id, parts[0]);
  if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
