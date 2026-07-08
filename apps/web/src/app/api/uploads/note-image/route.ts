import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import { upload } from "@mewmo/storage";

import { auth } from "../../../../lib/auth";
import { uploadNoteImageFile } from "../../../../lib/note-image-upload";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const noteId = formData.get("noteId");
  const file = formData.get("file");

  if (typeof noteId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId: session.user.id, deletedAt: null },
    select: { id: true },
  });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await uploadNoteImageFile({
      noteId,
      file,
      upload,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unsupported image type" || message === "Image is too large" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
