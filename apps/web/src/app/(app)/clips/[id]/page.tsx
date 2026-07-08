import { notFound, redirect } from "next/navigation";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { ClipDetailClient } from "./ClipDetailClient";

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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClipSelect;

type ClipListItem = Prisma.ClipGetPayload<{ select: typeof clipListSelect }>;

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const prisma = getPrisma();
  const [clip, clips] = await Promise.all([
    prisma.clip.findFirst({
      where: { id, userId: session.user.id, deletedAt: null },
    }),
    prisma.clip.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: clipListSelect,
    }),
  ]);

  if (!clip) notFound();

  return (
    <ClipDetailClient
      clip={{
        id: clip.id,
        url: clip.url,
        title: clip.title,
        summary: clip.summary,
        favicon: clip.favicon,
        coverImage: clip.coverImage,
        excerpt: clip.excerpt,
        sourceName: clip.sourceName,
        author: clip.author,
        publishedAt: clip.publishedAt?.toISOString() ?? null,
        content: clip.content,
        createdAt: clip.createdAt.toISOString(),
        updatedAt: clip.updatedAt.toISOString(),
      }}
      clips={clips.map((item: ClipListItem) => ({
        ...item,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
