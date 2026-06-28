import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { auth } from "../../../lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const notes = await prisma.note.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, summary: true, pinned: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = body.title || "Untitled";
  const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";

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
