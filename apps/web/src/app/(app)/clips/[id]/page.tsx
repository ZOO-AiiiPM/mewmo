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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClipSelect;

type ClipListItem = Prisma.ClipGetPayload<{ select: typeof clipListSelect }>;

function toPlainText(content: string) {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

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
        content: clip.content,
        createdAt: clip.createdAt.toISOString(),
        updatedAt: clip.updatedAt.toISOString(),
      }}
      clips={clips.map((item: ClipListItem) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
      contentText={toPlainText(clip.content)}
    />
  );
}
