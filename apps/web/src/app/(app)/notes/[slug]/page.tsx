import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { listNotesWithPreviews } from "../../../../lib/note-list-data";
import { decodeNoteSlug } from "../../../../lib/note-slug";
import { NoteEditorPage } from "./NoteEditorPage";

export default async function NoteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { slug: encodedSlug } = await params;
  const slug = decodeNoteSlug(encodedSlug);
  const prisma = getPrisma();
  const [note, notes] = await Promise.all([
    prisma.note.findFirst({
      where: { userId: session.user.id, slug, deletedAt: null },
    }),
    listNotesWithPreviews(session.user.id, prisma),
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
      notes={notes.map((item) => ({
        ...item,
        ...(note.id === item.id ? { content: note.content } : {}),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
