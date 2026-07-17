import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { addClipFetchJob } from "@mewmo/queue";
import { createClipSchema, normalizeClipUrlIdentity } from "@mewmo/shared";
import { auth } from "../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../lib/server-timing";

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

const CLIP_QUEUE_TIMEOUT_MS = 5_000;

async function withQueueTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Clip background fetch queue timed out")),
          CLIP_QUEUE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function enqueueClipFetch(clipId: string) {
  const prisma = getPrisma();
  await prisma.clip.update({
    where: { id: clipId },
    data: { fetchStatus: "queued", fetchError: null, version: { increment: 1 } },
  });
  try {
    await withQueueTimeout(addClipFetchJob({ clipId }));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue clip fetch";
    await prisma.clip.update({
      where: { id: clipId },
      data: { fetchStatus: "error", fetchError: message, version: { increment: 1 } },
    });
    return false;
  }
}

export async function GET(request: Request) {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const includeContent = new URL(request.url).searchParams.get("includeContent") === "1";
  const prisma = getPrisma();
  const clips = await timing.measure("db", () => prisma.clip.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { ...clipListSelect, ...(includeContent ? { content: true } : {}) },
  }));

  return attachServerTiming(NextResponse.json(clips), timing);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();
  const normalizedUrl = normalizeClipUrlIdentity(parsed.data.url);
  const existing = await prisma.clip.findFirst({
    where: { userId: session.user.id, normalizedUrl, deletedAt: null },
  });
  if (existing) {
    const active = existing.fetchStatus === "queued" || existing.fetchStatus === "fetching";
    const queued = active || (existing.fetchStatus === "error" ? await enqueueClipFetch(existing.id) : false);
    return NextResponse.json({ ...existing, existing: true, queued });
  }

  try {
    const clip = await prisma.clip.create({
      data: {
        userId: session.user.id,
        url: parsed.data.url,
        normalizedUrl,
        title: parsed.data.title,
        content: parsed.data.content,
        summary: parsed.data.summary ?? null,
        favicon: parsed.data.favicon ?? null,
        coverImage: parsed.data.coverImage ?? null,
        excerpt: parsed.data.excerpt ?? null,
        sourceName: parsed.data.sourceName ?? null,
        author: parsed.data.author ?? null,
        publishedAt: parsed.data.publishedAt ?? null,
        fetchStatus: "queued",
      },
    });
    const queued = await enqueueClipFetch(clip.id);
    return NextResponse.json({ ...clip, fetchStatus: queued ? "queued" : "error", existing: false, queued }, { status: 201 });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const duplicate = await prisma.clip.findFirst({
      where: { userId: session.user.id, normalizedUrl },
    });
    if (!duplicate) return NextResponse.json({ error: "Clip already exists" }, { status: 409 });
    const restored = duplicate.deletedAt
      ? await prisma.clip.update({
          where: { id: duplicate.id },
          data: {
            deletedAt: null,
            url: parsed.data.url,
            title: parsed.data.title,
            fetchStatus: "queued",
            fetchError: null,
            version: { increment: 1 },
          },
        })
      : duplicate;
    const active = restored.fetchStatus === "queued" || restored.fetchStatus === "fetching";
    const queued = active || await enqueueClipFetch(restored.id);
    return NextResponse.json({ ...restored, existing: true, queued });
  }
}
