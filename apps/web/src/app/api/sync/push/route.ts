import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import {
  createClipSchema,
  createNoteSchema,
  syncPushSchema,
  updateClipSchema,
  updateNoteSchema,
  type SyncEntity,
  type SyncMutation,
  type SyncOperation,
} from "@mewmo/shared";

import { auth } from "../../../../lib/auth";

interface AppliedMutation {
  index: number;
  entity: SyncEntity;
  op: SyncOperation;
  record: unknown;
}

interface MutationError {
  index: number;
  reason: string;
}

function createSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

async function createUniqueNoteSlug(userId: string, title: string): Promise<string> {
  const prisma = getPrisma();
  const baseSlug = createSlug(title);
  let slug = baseSlug;
  let attempt = 0;

  while (true) {
    const existing = await prisma.note.findFirst({
      where: { userId, slug },
      select: { id: true },
    });
    if (!existing) return slug;

    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }
}

async function applyNoteMutation(userId: string, mutation: SyncMutation) {
  const prisma = getPrisma();

  if (mutation.op === "create") {
    const data = mutation.data ?? {};
    const title = typeof data.title === "string" && data.title.length > 0 ? data.title : "Untitled";
    const slug = await createUniqueNoteSlug(userId, title);
    const parsed = createNoteSchema.safeParse({
      slug,
      title,
      content: typeof data.content === "string" ? data.content : "",
      summary: typeof data.summary === "string" ? data.summary : undefined,
      pinned: typeof data.pinned === "boolean" ? data.pinned : false,
      tags: Array.isArray(data.tags) ? data.tags : [],
    });

    if (!parsed.success) return { error: "invalid_note" };

    const { tags, ...noteData } = parsed.data;
    void tags;

    return {
      record: await prisma.note.create({
        data: { ...noteData, userId },
      }),
    };
  }

  if (!mutation.id) return { error: "missing_id" };

  if (mutation.op === "update") {
    const parsed = updateNoteSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return { error: "invalid_note" };

    const { tags, ...noteData } = parsed.data;
    void tags;

    const updateResult = await prisma.note.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { ...noteData, version: { increment: 1 } },
    });
    if (updateResult.count === 0) return { error: "not_found" };

    return {
      record: await prisma.note.findFirst({
        where: { id: mutation.id, userId },
      }),
    };
  }

  if (mutation.op === "delete") {
    const updateResult = await prisma.note.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (updateResult.count === 0) return { error: "not_found" };

    return {
      record: await prisma.note.findFirst({
        where: { id: mutation.id, userId },
      }),
    };
  }

  return { error: "unsupported_operation" };
}

async function applyClipMutation(userId: string, mutation: SyncMutation) {
  const prisma = getPrisma();

  if (mutation.op === "create") {
    const parsed = createClipSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return { error: "invalid_clip" };

    const { tags, ...clipData } = parsed.data;
    void tags;

    return {
      record: await prisma.clip.create({
        data: { ...clipData, userId },
      }),
    };
  }

  if (!mutation.id) return { error: "missing_id" };

  if (mutation.op === "update") {
    const parsed = updateClipSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return { error: "invalid_clip" };

    const { tags, ...clipData } = parsed.data;
    void tags;

    const updateResult = await prisma.clip.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { ...clipData, version: { increment: 1 } },
    });
    if (updateResult.count === 0) return { error: "not_found" };

    return {
      record: await prisma.clip.findFirst({
        where: { id: mutation.id, userId },
      }),
    };
  }

  if (mutation.op === "delete") {
    const updateResult = await prisma.clip.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (updateResult.count === 0) return { error: "not_found" };

    return {
      record: await prisma.clip.findFirst({
        where: { id: mutation.id, userId },
      }),
    };
  }

  return { error: "unsupported_operation" };
}

async function applyFeedEntryMutation(userId: string, mutation: SyncMutation) {
  const prisma = getPrisma();

  if (!mutation.id) return { error: "missing_id" };

  if (mutation.op === "mark_read" || mutation.op === "mark_unread") {
    const updateResult = await prisma.feedEntry.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: {
        readAt: mutation.op === "mark_read" ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) return { error: "not_found" };

    return {
      record: await prisma.feedEntry.findFirst({
        where: { id: mutation.id, userId },
      }),
    };
  }

  return { error: "unsupported_operation" };
}

async function applyMutation(userId: string, mutation: SyncMutation) {
  if (mutation.entity === "note") return applyNoteMutation(userId, mutation);
  if (mutation.entity === "clip") return applyClipMutation(userId, mutation);
  if (mutation.entity === "feed_entry") return applyFeedEntryMutation(userId, mutation);

  return { error: "unsupported_entity" };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = syncPushSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const applied: AppliedMutation[] = [];
  const errors: MutationError[] = [];

  for (const [index, mutation] of parsed.data.mutations.entries()) {
    const result = await applyMutation(session.user.id, mutation);

    if ("error" in result) {
      errors.push({ index, reason: result.error });
      continue;
    }

    applied.push({
      index,
      entity: mutation.entity,
      op: mutation.op,
      record: result.record,
    });
  }

  return NextResponse.json({ applied, errors });
}
