import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../../lib/auth";
import { NoteEditorPage } from "./NoteEditorPage";

export default async function NoteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { slug } = await params;
  const prisma = getPrisma();
  const note = await prisma.note.findFirst({
    where: { userId: session.user.id, slug, deletedAt: null },
  });

  if (!note) notFound();

  return <NoteEditorPage noteId={note.id} title={note.title} content={note.content} />;
}
