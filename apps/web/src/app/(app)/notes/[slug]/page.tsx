import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { NoteEditorPage } from "./NoteEditorPage";

export default async function NoteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { slug } = await params;
  const prisma = getPrisma();
  const [note, notes] = await Promise.all([
    prisma.note.findFirst({
      where: { userId: session.user.id, slug, deletedAt: null },
    }),
    prisma.note.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, summary: true, pinned: true, updatedAt: true },
    }),
  ]);

  if (!note) notFound();

  return (
    <NoteEditorPage
      note={{
        id: note.id,
        slug: note.slug,
        title: note.title,
        content: note.content,
      }}
      notes={notes.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
