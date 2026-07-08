import { NextResponse } from "next/server";
import { createTrashRepository } from "@mewmo/db";

import { auth } from "../../../lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await createTrashRepository().list(session.user.id);
  return NextResponse.json(items);
}
