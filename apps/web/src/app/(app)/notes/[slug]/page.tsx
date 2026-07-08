import { notFound, redirect } from "next/navigation";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { NoteEditorPage } from "./NoteEditorPage";

const noteListSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  content: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

type NoteListItem = Prisma.NoteGetPayload<{ select: typeof noteListSelect }>;

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
      select: noteListSelect,
    }),
  ]);

  if (!note) notFound();

  return (
    <NoteEditorPage
      note={{
        id: note.id,
        slug: note.slug,
        title: note.title,
        summary: note.summary,
        content: note.content,
        updatedAt: note.updatedAt.toISOString(),
      }}
      notes={notes.map((item: NoteListItem) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
