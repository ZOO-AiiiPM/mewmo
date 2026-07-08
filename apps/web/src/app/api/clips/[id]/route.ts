import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { updateClipSchema } from "@mewmo/shared";
import { auth } from "../../../../lib/auth";
import { fetchClipFromUrl } from "../../../../lib/clip-fetch";

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
    ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
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

  const fetched = await fetchClipFromUrl(clip.url).catch(() => null);
  if (!fetched) {
    return NextResponse.json({ error: "Could not refresh clip" }, { status: 502 });
  }

  const data = normalizeRefreshData(fetched);
  if (!hasClipChanged(clip, data)) {
    return NextResponse.json({ clip, changed: false });
  }

  const updated = await prisma.clip.update({
    where: { id },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  return NextResponse.json({ clip: updated, changed: true });
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
