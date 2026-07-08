import { redirect } from "next/navigation";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";
import { NoteEditorPage } from "./[slug]/NoteEditorPage";

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

export default async function NotesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const prisma = getPrisma();
  const notes = await prisma.note.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: noteListSelect,
  });

  return (
    <NoteEditorPage
      note={null}
      notes={notes.map((item: NoteListItem) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
