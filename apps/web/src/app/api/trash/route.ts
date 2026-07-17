import { NextResponse } from "next/server";
import { createTrashRepository } from "@mewmo/db";

import { auth } from "../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../lib/server-timing";

export async function GET() {
  const timing = createServerTiming();
  const session = await timing.measure("auth", () => auth());
  if (!session?.user?.id) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }
  const userId = session.user.id;

  const items = await timing.measure("db", () => createTrashRepository().list(userId));
  return attachServerTiming(NextResponse.json(items), timing);
}
