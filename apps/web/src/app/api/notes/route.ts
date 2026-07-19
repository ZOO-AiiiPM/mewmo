import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";
import { listNotesWithPreviews } from "../../../lib/note-list-data";
import { createNoteSlug } from "../../../lib/note-slug";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notes = await listNotesWithPreviews(session.user.id);

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = body.title || "Untitled";
  const baseSlug = createNoteSlug(title);

  const prisma = getPrisma();

  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const existing = await prisma.note.findFirst({
      where: { userId: session.user.id, slug },
    });
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const note = await prisma.note.create({
    data: {
      title,
      slug,
      content: body.content || "",
      userId: session.user.id,
    },
  });

  return NextResponse.json(note, { status: 201 });
}
