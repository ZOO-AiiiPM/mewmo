import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { addSummaryJob, withTimeout } from "@mewmo/queue";
import { createClipSchema, normalizeClipUrlIdentity } from "@mewmo/shared";

import { auth } from "../../../lib/auth";
import { fetchClipFromUrl } from "../../../lib/clip-fetch";

const clipListSelect = {
  id: true,
  url: true,
  title: true,
  summary: true,
  favicon: true,
  coverImage: true,
  excerpt: true,
  sourceName: true,
  author: true,
  publishedAt: true,
  fetchStatus: true,
  fetchError: true,
  fetchedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClipSelect;

const SUMMARY_QUEUE_TIMEOUT_MS = 3_000;

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function clipFetchError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : "Could not fetch clip",
    status: isTimeoutError(error) ? 504 : 502,
  };
}

function sourceData(fetched: Awaited<ReturnType<typeof fetchClipFromUrl>>) {
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

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeContent = new URL(request.url).searchParams.get("includeContent") === "1";
  const prisma = getPrisma();
  const clips = await prisma.clip.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { ...clipListSelect, ...(includeContent ? { content: true } : {}) },
  });

  return NextResponse.json(clips);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = createClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();
  const normalizedUrl = normalizeClipUrlIdentity(parsed.data.url);
  const existing = await prisma.clip.findFirst({
    where: { userId, normalizedUrl, deletedAt: null },
  });
  if (existing) {
    return NextResponse.json({ ...existing, existing: true });
  }

  let fetched: Awaited<ReturnType<typeof fetchClipFromUrl>>;
  try {
    fetched = await fetchClipFromUrl(parsed.data.url);
  } catch (error) {
    const failure = clipFetchError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  try {
    const clip = await prisma.clip.create({
      data: {
        userId,
        url: parsed.data.url,
        normalizedUrl,
        ...sourceData(fetched),
        summary: null,
        fetchStatus: "success",
        fetchError: null,
        fetchedAt: new Date(),
      },
    });
    await enqueueSummary(userId, clip.id);
    return NextResponse.json({ ...clip, existing: false }, { status: 201 });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const duplicate = await prisma.clip.findFirst({
      where: { userId, normalizedUrl },
    });
    if (!duplicate) return NextResponse.json({ error: "Clip already exists" }, { status: 409 });
    if (!duplicate.deletedAt) return NextResponse.json({ ...duplicate, existing: true });

    const restored = await prisma.clip.update({
      where: { id: duplicate.id },
      data: {
        deletedAt: null,
        url: parsed.data.url,
        ...sourceData(fetched),
        fetchStatus: "success",
        fetchError: null,
        fetchedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await enqueueSummary(userId, restored.id);
    return NextResponse.json({ ...restored, existing: true });
  }
}
