import { after, NextResponse } from "next/server";
import { createFeedSchema, discoverFeedSchema, feedTypeSchema, updateFeedSchema } from "@mewmo/shared";
import { createFeedEntriesRepository, createFeedsRepository, getPrisma } from "@mewmo/db";
import { addFeedFetchJob, withTimeout } from "@mewmo/queue";

import { auth } from "../../../../lib/auth";
import { discoverFeeds, FeedSearchProviderNotConfiguredError } from "../../../../lib/feed-discovery";
import { fetchAndStoreFeed } from "../../../../lib/feed-fetch-service";

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

function cronAuthorized(request: Request) {
  const secret = process.env.FEED_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

const FEED_QUEUE_TIMEOUT_MS = 5_000;

function scheduleWebFeedFetch(userId: string, feedId: string) {
  after(async () => {
    await fetchAndStoreFeed(userId, feedId, {
      claimStatuses: ["error"],
      allowStaleTakeover: false,
    });
  });
}

interface EnqueueFeedFetchResult {
  queued: boolean;
  startedAt: Date;
}

async function enqueueFeedFetch(feedId: string): Promise<EnqueueFeedFetchResult> {
  const startedAt = new Date();
  await getPrisma().feed.update({
    where: { id: feedId },
    data: {
      lastFetchStatus: "queued",
      lastFetchError: null,
      lastFetchStartedAt: startedAt,
      version: { increment: 1 },
    },
  });

  try {
    await withTimeout(addFeedFetchJob({ feedId }), FEED_QUEUE_TIMEOUT_MS, "Feed queue submission timed out");
    return { queued: true, startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue feed fetch";
    await getPrisma().feed.update({
      where: { id: feedId },
      data: {
        lastFetchStatus: "error",
        lastFetchError: message,
        version: { increment: 1 },
      },
    });
    return { queued: false, startedAt };
  }
}

export async function GET(request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parts = pathParts(await params);
  if (parts.length === 0) {
    const typeParam = new URL(request.url).searchParams.get("type");
    const parsedType = typeParam ? feedTypeSchema.safeParse(typeParam) : null;
    if (parsedType && !parsedType.success) {
      return NextResponse.json({ error: "Invalid feed type" }, { status: 400 });
    }

    const feeds = (await createFeedsRepository().findByUserIdWithUnreadCount(session.user.id, parsedType?.data)) as Array<{
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

  const feed = await requireFeed(session.user.id, id);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!action) return NextResponse.json(feed);
  if (action === "entries") {
    return NextResponse.json(await createFeedEntriesRepository().findByFeedId(session.user.id, id));
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<FeedRouteParams> }) {
  const parts = pathParts(await params);
  if (parts.length === 1 && parts[0] === "cron-refresh") {
    if (!cronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dueFeeds = (await createFeedsRepository().findDueForRefresh()) as Array<{
      id: string;
    }>;
    const queued = (await Promise.all(dueFeeds.map((feed) => enqueueFeedFetch(feed.id)))).filter((result) => result.queued).length;
    return NextResponse.json({ checked: dueFeeds.length, queued });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (parts.length === 0) {
    const parsed = createFeedSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid feed", issues: parsed.error.issues }, { status: 400 });
    }

    try {
      const feed = await createFeedsRepository().create(session.user.id, {
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
      const feedRecord = feed as Record<string, unknown> & { id: string };
      const queueResult = await enqueueFeedFetch(feedRecord.id);
      if (!queueResult.queued) scheduleWebFeedFetch(session.user.id, feedRecord.id);
      return NextResponse.json(
        {
          ...feedRecord,
          lastFetchStartedAt: queueResult.startedAt,
          lastFetchStatus: queueResult.queued ? "queued" : "error",
          existing: false,
          queued: queueResult.queued,
          backgroundStarted: true,
        },
        { status: 201 },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await getPrisma().feed.findFirst({
          where: { url: parsed.data.url, userId: session.user.id, type: parsed.data.type, deletedAt: null },
        });
        if (!existing) {
          return NextResponse.json({ error: "Feed already exists" }, { status: 409 });
        }
        const active = existing.lastFetchStatus === "queued" || existing.lastFetchStatus === "fetching";
        const shouldRetry = existing.lastFetchStatus === "error" || existing.lastFetchStatus === "partial";
        const queueResult = active
          ? { queued: true, startedAt: existing.lastFetchStartedAt ?? new Date() }
          : shouldRetry
            ? await enqueueFeedFetch(existing.id)
            : { queued: false, startedAt: existing.lastFetchStartedAt ?? new Date() };
        const queued = queueResult.queued;
        const backgroundStarted = active || shouldRetry;
        if (shouldRetry && !queued) scheduleWebFeedFetch(session.user.id, existing.id);
        return NextResponse.json(
          {
            ...existing,
            lastFetchStartedAt: queueResult.startedAt,
            lastFetchStatus: shouldRetry ? (queued ? "queued" : "error") : existing.lastFetchStatus,
            existing: true,
            queued,
            backgroundStarted,
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
        userId: session.user.id,
        deletedAt: null,
        ...(parsedType?.data ? { type: parsedType.data } : {}),
      },
      select: { id: true },
    });

    const queued = (await Promise.all(feeds.map((feed) => enqueueFeedFetch(feed.id)))).filter((result) => result.queued).length;
    return NextResponse.json({ checked: feeds.length, queued });
  }

  if (parts.length === 2 && parts[1] === "refresh") {
    const feed = await requireFeed(session.user.id, parts[0]!);
    if (!feed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const queueResult = await enqueueFeedFetch(feed.id);
    return NextResponse.json({ queued: queueResult.queued }, { status: queueResult.queued ? 202 : 503 });
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

  const feed = await requireFeed(session.user.id, parts[0]);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await getPrisma().feed.update({
    where: { id: parts[0] },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
