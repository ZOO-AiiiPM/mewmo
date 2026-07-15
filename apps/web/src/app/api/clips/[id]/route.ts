import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { addSummaryJob, withTimeout } from "@mewmo/queue";
import { normalizeClipUrlIdentity, updateClipSchema } from "@mewmo/shared";
import { auth } from "../../../../lib/auth";
import { fetchClipFromUrl } from "../../../../lib/clip-fetch";

interface RefreshClipData {
  title: string;
  content: string;
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
    clip.favicon !== data.favicon ||
    clip.coverImage !== data.coverImage ||
    clip.excerpt !== data.excerpt ||
    clip.sourceName !== data.sourceName ||
    clip.author !== data.author ||
    !sameNullableDate(clip.publishedAt, data.publishedAt)
  );
}

const SUMMARY_QUEUE_TIMEOUT_MS = 3_000;

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function enqueueSummary(userId: string, clipId: string) {
  try {
    await withTimeout(
      addSummaryJob(
        { userId, targetId: clipId, targetType: "clip" },
        {
          jobId: `summary-clip-${clipId}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
      SUMMARY_QUEUE_TIMEOUT_MS,
      `Summary queue timed out for ${clipId}`,
    );
  } catch (error) {
    console.error("Failed to enqueue clip summary job", error);
  }
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

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: { id, userId, deletedAt: null },
  });

  if (!clip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    await enqueueSummary(userId, clip.id);
    return NextResponse.json({ status: "success", clip: updated, changed: hasClipChanged(clip, data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refresh clip";
    await prisma.clip.update({
      where: { id },
      data: { fetchStatus: "error", fetchError: message, version: { increment: 1 } },
    });
    return NextResponse.json({ error: message }, { status: isTimeoutError(error) ? 504 : 502 });
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
