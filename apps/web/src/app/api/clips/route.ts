import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { createClipSchema } from "@mewmo/shared";
import { auth } from "../../../lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const clips = await prisma.clip.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      url: true,
      title: true,
      summary: true,
      favicon: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(clips);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createClipSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data = {
    userId: session.user.id,
    url: parsed.data.url,
    title: parsed.data.title,
    content: parsed.data.content,
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.favicon !== undefined ? { favicon: parsed.data.favicon } : {}),
  };

  const prisma = getPrisma();
  const clip = await prisma.clip.create({
    data,
  });

  return NextResponse.json(clip, { status: 201 });
}
