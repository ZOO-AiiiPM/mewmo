import { summarizeContent } from "@mewmo/ai";
import { getPrisma } from "@mewmo/db";
import { z } from "zod";
import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";

const summaryRequestSchema = z.object({
  targetType: z.enum(["clip", "feed_entry"]),
  targetId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = summaryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();
  const userId = session.user.id;
  const { targetId, targetType } = parsed.data;

  try {
    if (targetType === "clip") {
      const clip = await prisma.clip.findFirst({
        where: { id: targetId, userId, deletedAt: null },
        select: {
          id: true,
          title: true,
          url: true,
          content: true,
          sourceName: true,
        },
      });

      if (!clip) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const summary = await summarizeContent({
        type: "clip",
        title: clip.title,
        source: clip.sourceName ?? domainFromUrl(clip.url),
        url: clip.url,
        content: clip.content,
      });

      await prisma.clip.updateMany({
        where: { id: targetId, userId, deletedAt: null },
        data: { summary, version: { increment: 1 } },
      });

      return NextResponse.json({ targetType, targetId, summary });
    }

    const entry = await prisma.feedEntry.findFirst({
      where: { id: targetId, userId, deletedAt: null },
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
        sourceName: true,
        feed: { select: { title: true } },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const summary = await summarizeContent({
      type: "feed_entry",
      title: entry.title,
      source: entry.feed?.title ?? entry.sourceName ?? domainFromUrl(entry.url),
      url: entry.url,
      content: entry.content,
    });

    await prisma.feedEntry.updateMany({
      where: { id: targetId, userId, deletedAt: null },
      data: { summary, version: { increment: 1 } },
    });

    return NextResponse.json({ targetType, targetId, summary });
  } catch (error) {
    console.error("Failed to generate AI summary", error);
    return NextResponse.json({ error: "Summary generation failed" }, { status: 502 });
  }
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
