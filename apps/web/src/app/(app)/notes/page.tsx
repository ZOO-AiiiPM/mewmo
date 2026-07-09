import { redirect } from "next/navigation";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";
import { NoteEditorPage } from "./[slug]/NoteEditorPage";

const noteListSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

type NoteListItem = Prisma.NoteGetPayload<{ select: typeof noteListSelect }>;

export default async function NotesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const prisma = getPrisma();
  const notes = await prisma.note.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: noteListSelect,
  });
  const selectedNote = notes[0]
    ? await prisma.note.findFirst({
        where: { id: notes[0].id, userId: session.user.id, deletedAt: null },
      })
    : null;

  return (
    <NoteEditorPage
      note={
        selectedNote
          ? {
              id: selectedNote.id,
              slug: selectedNote.slug,
              title: selectedNote.title,
              summary: selectedNote.summary,
              content: selectedNote.content,
              updatedAt: selectedNote.updatedAt.toISOString(),
            }
          : null
      }
      notes={notes.map((item: NoteListItem) => ({
        ...item,
        ...(selectedNote?.id === item.id ? { content: selectedNote.content } : {}),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
