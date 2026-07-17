import { NextResponse } from "next/server";
import { createTrashRepository } from "@mewmo/db";
import { z } from "zod";

import { auth } from "../../../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../../../lib/server-timing";

const trashKindSchema = z.enum(["note", "clip", "feed", "knowledge_base"]);

interface TrashItemRouteParams {
  kind: string;
  id: string;
}

function invalidKind() {
  return NextResponse.json({ error: "Invalid trash item type" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<TrashItemRouteParams> },
) {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const { kind, id } = await params;
  const parsedKind = trashKindSchema.safeParse(kind);
  if (!parsedKind.success) return attachServerTiming(invalidKind(), timing);

  const item = await timing.measure("db", () => createTrashRepository().get(userId, parsedKind.data, id));
  if (!item) return attachServerTiming(notFound(), timing);

  return attachServerTiming(NextResponse.json(item), timing);
}

export async function PATCH(_request: Request, { params }: { params: Promise<TrashItemRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind, id } = await params;
  const parsedKind = trashKindSchema.safeParse(kind);
  if (!parsedKind.success) return invalidKind();

  const restored = await createTrashRepository().restore(session.user.id, parsedKind.data, id);
  if (!restored) return notFound();

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<TrashItemRouteParams> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind, id } = await params;
  const parsedKind = trashKindSchema.safeParse(kind);
  if (!parsedKind.success) return invalidKind();

  const deleted = await createTrashRepository().deletePermanently(session.user.id, parsedKind.data, id);
  if (!deleted) return notFound();

  return NextResponse.json({ ok: true });
}
