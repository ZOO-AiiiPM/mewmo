import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { addClipFetchJob, addSummaryJob } from "@mewmo/queue";
import { normalizeClipUrlIdentity, updateClipSchema } from "@mewmo/shared";
import { auth } from "../../../../lib/auth";
import { fetchClipFromUrl } from "../../../../lib/clip-fetch";

function cronAuthorized(request: Request) {
  const secret = process.env.FEED_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

interface RefreshClipData {
  title: string;
  content: string;
  summary: string | null;
  favicon: string | null;
  coverImage: string | null;
  excerpt: string | null;
  sourceName: string | null;
  author: string | null;
  publishedAt: Date | null;
}

function normalizeRefreshData(fetched: Awaited<ReturnType<typeof fetchClipFromUrl>>): RefreshClipData {
  return {
    title: fetched.title,
    content: fetched.content,
    summary: fetched.summary ?? null,
    favicon: fetched.favicon ?? null,
    coverImage: fetched.coverImage ?? null,
    excerpt: fetched.excerpt ?? null,
    sourceName: fetched.sourceName ?? null,
    author: fetched.author ?? null,
    publishedAt: fetched.publishedAt ?? null,
  };
}

function sameNullableDate(left: Date | null, right: Date | null) {
  return (left?.toISOString() ?? null) === (right?.toISOString() ?? null);
}

function hasClipChanged(
  clip: {
    title: string;
    content: string;
    summary: string | null;
    favicon: string | null;
    coverImage: string | null;
    excerpt: string | null;
    sourceName: string | null;
    author: string | null;
    publishedAt: Date | null;
  },
  data: RefreshClipData,
) {
  return (
    clip.title !== data.title ||
    clip.content !== data.content ||
    clip.summary !== data.summary ||
    clip.favicon !== data.favicon ||
    clip.coverImage !== data.coverImage ||
    clip.excerpt !== data.excerpt ||
    clip.sourceName !== data.sourceName ||
    clip.author !== data.author ||
    !sameNullableDate(clip.publishedAt, data.publishedAt)
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(clip);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = updateClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = {
    ...(parsed.data.url !== undefined
      ? { url: parsed.data.url, normalizedUrl: normalizeClipUrlIdentity(parsed.data.url) }
      : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.favicon !== undefined ? { favicon: parsed.data.favicon } : {}),
    ...(parsed.data.coverImage !== undefined ? { coverImage: parsed.data.coverImage } : {}),
    ...(parsed.data.excerpt !== undefined ? { excerpt: parsed.data.excerpt } : {}),
    ...(parsed.data.sourceName !== undefined ? { sourceName: parsed.data.sourceName } : {}),
    ...(parsed.data.author !== undefined ? { author: parsed.data.author } : {}),
    ...(parsed.data.publishedAt !== undefined ? { publishedAt: parsed.data.publishedAt } : {}),
  };

  const updated = await prisma.clip.update({
    where: { id },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  return NextResponse.json(updated);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const background = new URL(request.url).searchParams.get("background") === "1";
  const session = background ? null : await auth();
  if (background ? !cronAuthorized(request) : !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: background
      ? { id, deletedAt: null }
      : { id, userId: session!.user!.id!, deletedAt: null },
  });

  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!background) {
    const queuedClip = await prisma.clip.update({
      where: { id },
      data: { fetchStatus: "queued", fetchError: null, version: { increment: 1 } },
    });
    try {
      await addClipFetchJob({ clipId: id });
      return NextResponse.json({ clip: queuedClip, changed: false, queued: true }, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to queue clip fetch";
      const failedClip = await prisma.clip.update({
        where: { id },
        data: { fetchStatus: "error", fetchError: message, version: { increment: 1 } },
      });
      return NextResponse.json({ clip: failedClip, changed: false, queued: false }, { status: 503 });
    }
  }

  await prisma.clip.update({
    where: { id },
    data: { fetchStatus: "fetching", fetchError: null, version: { increment: 1 } },
  });

  try {
    const fetched = await fetchClipFromUrl(clip.url);
    const data = normalizeRefreshData(fetched);
    const updated = await prisma.clip.update({
      where: { id },
      data: {
        ...data,
        fetchStatus: "success",
        fetchError: null,
        fetchedAt: new Date(),
        version: { increment: 1 },
      },
    });
    try {
      await addSummaryJob({ userId: clip.userId, targetId: clip.id, targetType: "clip" });
    } catch (error) {
      console.error("Failed to enqueue clip summary job", error);
    }
    return NextResponse.json({ status: "success", clip: updated, changed: hasClipChanged(clip, data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh clip";
    await prisma.clip.update({
      where: { id },
      data: { fetchStatus: "error", fetchError: message, version: { increment: 1 } },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await prisma.clip.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, version: deleted.version });
}
