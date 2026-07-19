import { NextResponse } from "next/server";
import { createTagsRepository } from "@mewmo/db";

import { auth } from "../../../lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await createTagsRepository().findByUserId(session.user.id));
}
