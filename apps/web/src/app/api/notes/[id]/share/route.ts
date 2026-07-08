import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createNoteSharesRepository, getPrisma } from "@mewmo/db";
import { auth } from "../../../../../lib/auth";

function createShareToken() {
  return randomBytes(24).toString("base64url");
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: { id: true },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const share = (await createNoteSharesRepository(prisma).createOrReuse(
    session.user.id,
    note.id,
    createShareToken,
  )) as { token: string };

  return NextResponse.json({
    token: share.token,
    url: `/share/notes/${share.token}`,
  });
}
