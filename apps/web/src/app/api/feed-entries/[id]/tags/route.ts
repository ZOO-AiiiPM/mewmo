import { NextResponse } from "next/server";
import { createTagsRepository, TaggableTargetNotFoundError } from "@mewmo/db";
import { replaceFeedEntryTagsSchema } from "@mewmo/shared";

import { auth } from "../../../../../lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = replaceFeedEntryTagsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tags", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const tags = await createTagsRepository().replaceFeedEntryTags(
      session.user.id,
      id,
      parsed.data.tags.map((tag) => ({
        name: tag.name,
        ...(tag.color !== undefined ? { color: tag.color } : {}),
      })),
    );
    return NextResponse.json({ tags });
  } catch (error) {
    if (error instanceof TaggableTargetNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
