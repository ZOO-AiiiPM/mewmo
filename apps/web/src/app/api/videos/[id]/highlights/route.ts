import { NextResponse } from "next/server";
import { createVideosRepository, VideoEntryNotFoundError } from "@mewmo/db";
import { createVideoHighlightSchema } from "@mewmo/shared";

import { auth } from "../../../../../lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createVideoHighlightSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid highlight", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const highlight = await createVideosRepository().createHighlight(
      session.user.id,
      id,
      {
        text: parsed.data.text,
        ...(parsed.data.startSeconds !== undefined
          ? { startSeconds: parsed.data.startSeconds }
          : {}),
      },
    );
    return NextResponse.json(highlight, { status: 201 });
  } catch (error) {
    if (error instanceof VideoEntryNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
