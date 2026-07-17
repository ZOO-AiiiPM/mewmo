import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../lib/server-timing";

function todayWindow() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);
  return { startOfToday, startOfTomorrow };
}

function isInWindow(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date < end);
}

export async function GET() {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const prisma = getPrisma();
  const { startOfToday, startOfTomorrow } = todayWindow();

  const [notes, clips, feedEntries] = await timing.measure("db", () => Promise.all([
    prisma.note.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { createdAt: { gte: startOfToday, lt: startOfTomorrow } },
          { updatedAt: { gte: startOfToday, lt: startOfTomorrow } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 16,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.clip.findMany({
      where: {
        userId,
        deletedAt: null,
        createdAt: { gte: startOfToday, lt: startOfTomorrow },
      },
      orderBy: { createdAt: "desc" },
      take: 16,
      select: {
        id: true,
        url: true,
        title: true,
        summary: true,
        excerpt: true,
        coverImage: true,
        favicon: true,
        sourceName: true,
        author: true,
        publishedAt: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.feedEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { createdAt: { gte: startOfToday, lt: startOfTomorrow } },
          { publishedAt: { gte: startOfToday, lt: startOfTomorrow } },
        ],
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 16,
      select: {
        id: true,
        feedId: true,
        title: true,
        url: true,
        summary: true,
        excerpt: true,
        coverImage: true,
        sourceName: true,
        author: true,
        publishedAt: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        feed: {
          select: {
            title: true,
            favicon: true,
            type: true,
          },
        },
      },
    }),
  ] as const));

  const items = [
    ...notes.map((note) => ({
      type: "note" as const,
      id: note.id,
      href: `/notes/${note.slug}`,
      title: note.title,
      summary: note.summary,
      version: note.version,
      eventAt: note.updatedAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    ...clips.map((clip) => ({
      type: "clip" as const,
      id: clip.id,
      href: `/clips/${clip.id}`,
      title: clip.title,
      summary: clip.summary,
      excerpt: clip.excerpt,
      url: clip.url,
      coverImage: clip.coverImage,
      favicon: clip.favicon,
      sourceName: clip.sourceName,
      author: clip.author,
      publishedAt: clip.publishedAt,
      version: clip.version,
      eventAt: clip.createdAt,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    })),
    ...feedEntries.map((entry) => {
      const eventAt = isInWindow(entry.publishedAt, startOfToday, startOfTomorrow)
        ? entry.publishedAt!
        : entry.createdAt;
      return {
        type: "feed" as const,
        id: entry.id,
        href: `/feeds?type=${entry.feed.type}&feedId=${entry.feedId}&entryId=${entry.id}`,
        feedId: entry.feedId,
        title: entry.title,
        summary: entry.summary,
        excerpt: entry.excerpt,
        url: entry.url,
        coverImage: entry.coverImage,
        sourceName: entry.sourceName,
        author: entry.author,
        publishedAt: entry.publishedAt,
        favicon: entry.feed.favicon,
        feedTitle: entry.feed.title,
        version: entry.version,
        eventAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      };
    }),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return attachServerTiming(NextResponse.json(items.slice(0, 40)), timing);
}
