import { NextResponse } from "next/server";
import { getPrisma, Prisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";
import { createNoteSlug } from "../../../lib/note-slug";
import { attachServerTiming, createServerTiming } from "../../../lib/server-timing";

const noteListSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

export async function GET() {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const prisma = getPrisma();
  const notes = await timing.measure("db", () => prisma.note.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: noteListSelect,
  }));

  return attachServerTiming(NextResponse.json(notes), timing);
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
