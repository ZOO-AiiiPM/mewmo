import { NextResponse } from "next/server";
import { createVideosRepository } from "@mewmo/db";

import { auth } from "../../../../../../lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; highlightId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, highlightId } = await params;
  const deleted = await createVideosRepository().deleteHighlight(
    session.user.id,
    id,
    highlightId,
  );
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
