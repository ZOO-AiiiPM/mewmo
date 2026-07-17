import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { updateNoteSchema } from "@mewmo/shared";
import { auth } from "../../../../lib/auth";
import { createNoteSlug } from "../../../../lib/note-slug";
import { attachServerTiming, createServerTiming } from "../../../../lib/server-timing";

async function createUniqueNoteSlug(userId: string, noteId: string, title: string) {
  const prisma = getPrisma();
  const baseSlug = createNoteSlug(title);
  let slug = baseSlug;
  let attempt = 0;

  while (true) {
    const existing = await prisma.note.findFirst({
      where: { userId, slug, id: { not: noteId } },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const { id } = await params;
  const prisma = getPrisma();
  const note = await timing.measure("db", () => prisma.note.findFirst({
    where: { id, userId, deletedAt: null },
  }));

  if (!note) {
    return attachServerTiming(NextResponse.json({ error: "Not found" }, { status: 404 }), timing);
  }

  return attachServerTiming(NextResponse.json(note), timing);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();

  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: {
    slug?: string;
    title?: string;
    content?: string;
    summary?: string;
    pinned?: boolean;
    version: { increment: number };
  } = { version: { increment: 1 } };
  if (parsed.data.title !== undefined) {
    updateData.title = parsed.data.title;
    updateData.slug = await createUniqueNoteSlug(session.user.id, id, parsed.data.title);
  }
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
  if (parsed.data.summary !== undefined) updateData.summary = parsed.data.summary;
  if (parsed.data.pinned !== undefined) updateData.pinned = parsed.data.pinned;

  const updated = await prisma.note.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();

  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.note.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
