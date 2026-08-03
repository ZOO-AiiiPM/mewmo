import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { createClipSchema } from "@mewmo/shared";
import { createActor, createUrlCaptureService, DomainError } from "@mewmo/application";

import { auth } from "../../../lib/auth";
import { fetchClipFromUrl } from "../../../lib/clip-fetch";
import { enqueueArticleRuns } from "../../../lib/ai-run-enqueue";
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

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function clipFetchError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : "Could not fetch clip",
    status: error instanceof DomainError && error.code === "already_exists"
      ? 409
      : isTimeoutError(error) || (error instanceof DomainError && error.details?.timeout === true) ? 504 : 502,
  };
}

async function enqueueWorkflows(userId: string, clip: { id: string; version: number }) {
  try {
    await enqueueArticleRuns({ userId, targetType: "clip", targetId: clip.id, inputVersion: clip.version });
  } catch (error) {
    console.error("Failed to enqueue clip AI workflows", error);
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
  const userId = session.user.id;

  const parsed = createClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const capture = createUrlCaptureService({
      fetchClip: fetchClipFromUrl,
      enqueueClip: (clip, ownerId) => enqueueWorkflows(ownerId, clip),
    });
    const result = await capture.saveClip(
      createActor({ userId, source: "web", scopes: ["*"] }),
      parsed.data.url,
    );
    return NextResponse.json({ ...(result.record as Record<string, unknown>), existing: result.status === "existing" }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const failure = clipFetchError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
