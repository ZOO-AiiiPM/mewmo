import { notFound, redirect } from "next/navigation";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { decodeNoteSlug } from "../../../../lib/note-slug";
import { NoteEditorPage } from "./NoteEditorPage";

const noteListSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  pinned: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

type NoteListItem = Prisma.NoteGetPayload<{ select: typeof noteListSelect }>;

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
        version: note.version,
        updatedAt: note.updatedAt.toISOString(),
      }}
      notes={notes.map((item: NoteListItem) => ({
        ...item,
        ...(note.id === item.id ? { content: note.content } : {}),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
