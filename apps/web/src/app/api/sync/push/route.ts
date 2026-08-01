import { NextResponse } from "next/server";
import { getPrisma } from "@mewmo/db";
import {
  createClipSchema,
  normalizeClipUrlIdentity,
  createNoteSchema,
  updateClipSchema,
  updateNoteSchema,
} from "@mewmo/shared";
import {
  SYNC_CONTRACT_VERSION,
  syncPushSchema,
  type SyncEntity,
  type SyncMutation,
  type SyncOperation,
  type SyncErrorCode,
} from "@mewmo/sync";

import { auth } from "../../../../lib/auth";
import { createNoteSlug } from "../../../../lib/note-slug";

interface AppliedMutation {
  index: number;
  entity: SyncEntity;
  op: SyncOperation;
  record: unknown;
  clientMutationId?: string;
}

interface MutationError {
  index: number;
  code: SyncErrorCode;
  message?: string;
  clientMutationId?: string;
  record?: unknown;
}

/** Exit shape from a single mutation apply. */
type ApplyResult =
  | { ok: true; record: unknown }
  | { ok: false; code: SyncErrorCode; message?: string; record?: unknown };

function conflict(message: string, record?: unknown): ApplyResult {
  return {
    ok: false,
    code: "version_conflict",
    message,
    ...(record !== undefined ? { record } : {}),
  };
}

function fail(code: SyncErrorCode, message?: string): ApplyResult {
  return { ok: false, code, ...(message !== undefined ? { message } : {}) };
}

async function createUniqueNoteSlug(userId: string, title: string): Promise<string> {
  const prisma = getPrisma();
  const baseSlug = createNoteSlug(title);
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

async function applyNoteMutation(userId: string, mutation: SyncMutation): Promise<ApplyResult> {
  const prisma = getPrisma();

  if (mutation.op === "create") {
    const data = mutation.data ?? {};
    const title = typeof data.title === "string" && data.title.length > 0 ? data.title : "Untitled";

    // Idempotency: if the client supplied an id and it already exists, return it.
    if (mutation.id) {
      const existing = await prisma.note.findFirst({ where: { id: mutation.id, userId } });
      if (existing && !existing.deletedAt) return { ok: true, record: existing };
      if (existing && existing.deletedAt) {
        // Re-create after soft delete: restore the row.
        const restored = await prisma.note.update({
          where: { id: mutation.id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        return { ok: true, record: restored };
      }
      // Fall through: the id is free, continue with a normal create below.
    }

    const slug = await createUniqueNoteSlug(userId, title);
    const parsed = createNoteSchema.safeParse({
      slug,
      title,
      content: typeof data.content === "string" ? data.content : "",
      summary: typeof data.summary === "string" ? data.summary : undefined,
      pinned: typeof data.pinned === "boolean" ? data.pinned : false,
      tags: Array.isArray(data.tags) ? data.tags : [],
    });

    if (!parsed.success) return fail("invalid_note");

    const { tags, ...noteData } = parsed.data;
    void tags;

    return {
      ok: true,
      record: await prisma.note.create({
        data: {
          ...(mutation.id ? { id: mutation.id } : {}),
          slug: noteData.slug,
          title: noteData.title,
          content: noteData.content,
          pinned: noteData.pinned,
          ...(noteData.summary !== undefined ? { summary: noteData.summary } : {}),
          userId,
        },
      }),
    };
  }

  if (!mutation.id) return fail("missing_id");

  if (mutation.op === "update") {
    const parsed = updateNoteSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return fail("invalid_note");

    const { tags, expectedVersion, ...noteData } = parsed.data;
    void tags;

    const current = await prisma.note.findFirst({ where: { id: mutation.id, userId } });
    if (!current || current.deletedAt) return fail("not_found");
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      return conflict(`expected version ${expectedVersion}, found ${current.version}`, current);
    }

    const updateResult = await prisma.note.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: {
        ...(noteData.title !== undefined ? { title: noteData.title } : {}),
        ...(noteData.content !== undefined ? { content: noteData.content } : {}),
        ...(noteData.summary !== undefined ? { summary: noteData.summary } : {}),
        ...(noteData.pinned !== undefined ? { pinned: noteData.pinned } : {}),
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) return fail("not_found");

    return {
      ok: true,
      record: await prisma.note.findFirst({ where: { id: mutation.id, userId } }),
    };
  }

  if (mutation.op === "delete") {
    const data = mutation.data ?? {};
    const expectedVersion =
      typeof data.expectedVersion === "number" ? data.expectedVersion : undefined;

    const current = await prisma.note.findFirst({ where: { id: mutation.id, userId } });
    if (!current || current.deletedAt) return fail("not_found");
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      return conflict(`expected version ${expectedVersion}, found ${current.version}`, current);
    }

    const updateResult = await prisma.note.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (updateResult.count === 0) return fail("not_found");

    return {
      ok: true,
      record: await prisma.note.findFirst({ where: { id: mutation.id, userId } }),
    };
  }

  return fail("unsupported_operation", `operation ${mutation.op} not supported for note`);
}

async function applyClipMutation(userId: string, mutation: SyncMutation): Promise<ApplyResult> {
  const prisma = getPrisma();

  if (mutation.op === "create") {
    const parsed = createClipSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return fail("invalid_clip");

    const { tags, ...clipData } = parsed.data;
    void tags;
    const normalizedUrl = normalizeClipUrlIdentity(clipData.url);

    // Idempotency: same id already present → return it.
    if (mutation.id) {
      const existing = await prisma.clip.findFirst({ where: { id: mutation.id, userId } });
      if (existing && !existing.deletedAt) return { ok: true, record: existing };
    }

    const existing = await prisma.clip.findFirst({
      where: { userId, normalizedUrl, deletedAt: null },
    });
    if (existing) return { ok: true, record: existing };

    try {
      return {
        ok: true,
        record: await prisma.clip.create({
          data: {
            ...(mutation.id ? { id: mutation.id } : {}),
            url: clipData.url,
            normalizedUrl,
            title: clipData.title,
            content: clipData.content,
            ...(clipData.summary !== undefined ? { summary: clipData.summary } : {}),
            ...(clipData.favicon !== undefined ? { favicon: clipData.favicon } : {}),
            ...(clipData.coverImage !== undefined ? { coverImage: clipData.coverImage } : {}),
            ...(clipData.excerpt !== undefined ? { excerpt: clipData.excerpt } : {}),
            ...(clipData.sourceName !== undefined ? { sourceName: clipData.sourceName } : {}),
            ...(clipData.author !== undefined ? { author: clipData.author } : {}),
            ...(clipData.publishedAt !== undefined ? { publishedAt: clipData.publishedAt } : {}),
            userId,
          },
        }),
      };
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
      return {
        ok: true,
        record: await prisma.clip.findFirst({ where: { userId, normalizedUrl, deletedAt: null } }),
      };
    }
  }

  if (!mutation.id) return fail("missing_id");

  if (mutation.op === "update") {
    const parsed = updateClipSchema.safeParse(mutation.data ?? {});
    if (!parsed.success) return fail("invalid_clip");

    const { tags, ...clipData } = parsed.data;
    void tags;

    const current = await prisma.clip.findFirst({ where: { id: mutation.id, userId } });
    if (!current || current.deletedAt) return fail("not_found");
    const data = mutation.data ?? {};
    const expectedVersion = typeof data.expectedVersion === "number" ? data.expectedVersion : undefined;
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      return conflict(`expected version ${expectedVersion}, found ${current.version}`, current);
    }

    if (clipData.url !== undefined) {
      const normalizedUrl = normalizeClipUrlIdentity(clipData.url);
      const duplicate = await prisma.clip.findFirst({
        where: { userId, normalizedUrl, deletedAt: null, NOT: { id: mutation.id } },
      });
      if (duplicate) return { ok: false, code: "duplicate_clip", record: duplicate };
    }

    const updateResult = await prisma.clip.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: {
        ...(clipData.url !== undefined
          ? { url: clipData.url, normalizedUrl: normalizeClipUrlIdentity(clipData.url) }
          : {}),
        ...(clipData.title !== undefined ? { title: clipData.title } : {}),
        ...(clipData.content !== undefined ? { content: clipData.content } : {}),
        ...(clipData.summary !== undefined ? { summary: clipData.summary } : {}),
        ...(clipData.favicon !== undefined ? { favicon: clipData.favicon } : {}),
        ...(clipData.coverImage !== undefined ? { coverImage: clipData.coverImage } : {}),
        ...(clipData.excerpt !== undefined ? { excerpt: clipData.excerpt } : {}),
        ...(clipData.sourceName !== undefined ? { sourceName: clipData.sourceName } : {}),
        ...(clipData.author !== undefined ? { author: clipData.author } : {}),
        ...(clipData.publishedAt !== undefined ? { publishedAt: clipData.publishedAt } : {}),
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) return fail("not_found");

    return {
      ok: true,
      record: await prisma.clip.findFirst({ where: { id: mutation.id, userId } }),
    };
  }

  if (mutation.op === "delete") {
    const data = mutation.data ?? {};
    const expectedVersion =
      typeof data.expectedVersion === "number" ? data.expectedVersion : undefined;

    const current = await prisma.clip.findFirst({ where: { id: mutation.id, userId } });
    if (!current || current.deletedAt) return fail("not_found");
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      return conflict(`expected version ${expectedVersion}, found ${current.version}`, current);
    }

    const updateResult = await prisma.clip.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (updateResult.count === 0) return fail("not_found");

    return {
      ok: true,
      record: await prisma.clip.findFirst({ where: { id: mutation.id, userId } }),
    };
  }

  return fail("unsupported_operation", `operation ${mutation.op} not supported for clip`);
}

async function applyFeedEntryMutation(userId: string, mutation: SyncMutation): Promise<ApplyResult> {
  const prisma = getPrisma();

  if (!mutation.id) return fail("missing_id");

  if (mutation.op === "mark_read" || mutation.op === "mark_unread") {
    const updateResult = await prisma.feedEntry.updateMany({
      where: { id: mutation.id, userId, deletedAt: null },
      data: {
        readAt: mutation.op === "mark_read" ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (updateResult.count === 0) return fail("not_found");

    return {
      ok: true,
      record: await prisma.feedEntry.findFirst({ where: { id: mutation.id, userId } }),
    };
  }

  return fail("unsupported_operation", `operation ${mutation.op} not supported for feed_entry`);
}

async function applyMutation(userId: string, mutation: SyncMutation): Promise<ApplyResult> {
  if (mutation.entity === "note") return applyNoteMutation(userId, mutation);
  if (mutation.entity === "clip") return applyClipMutation(userId, mutation);
  if (mutation.entity === "feed_entry") return applyFeedEntryMutation(userId, mutation);

  return fail("unsupported_entity", `entity ${mutation.entity} has no client-side mutation endpoint`);
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

    if (result.ok) {
      applied.push({
        index,
        entity: mutation.entity,
        op: mutation.op,
        record: result.record,
        ...(mutation.clientMutationId ? { clientMutationId: mutation.clientMutationId } : {}),
      });
    } else {
      errors.push({
        index,
        code: result.code,
        ...(result.message ? { message: result.message } : {}),
        ...(mutation.clientMutationId ? { clientMutationId: mutation.clientMutationId } : {}),
        ...(result.record !== undefined ? { record: result.record } : {}),
      });
    }
  }

  return NextResponse.json({ contractVersion: SYNC_CONTRACT_VERSION, applied, errors });
}
