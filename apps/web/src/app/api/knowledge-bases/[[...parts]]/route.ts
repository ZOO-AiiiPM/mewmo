import { NextResponse } from "next/server";
import {
  createKnowledgeAssetSchema,
  createKnowledgeBaseSchema,
  createKnowledgeFolderSchema,
  importKnowledgeItemsSchema,
  updateKnowledgeBaseSchema,
  updateKnowledgeFolderSchema,
} from "@mewmo/shared";
import {
  KnowledgeFolderDepthError,
  createKnowledgeBasesRepository,
} from "@mewmo/db";

import { auth } from "../../../../lib/auth";
import { attachServerTiming, createServerTiming } from "../../../../lib/server-timing";

interface KnowledgeRouteParams {
  parts?: string[];
}

function pathParts(params: KnowledgeRouteParams) {
  return params.parts ?? [];
}

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function invalid(error: unknown, label: string) {
  return NextResponse.json({ error: label, issues: error }, { status: 400 });
}

export async function GET(request: Request, { params }: { params: Promise<KnowledgeRouteParams> }) {
  const timing = createServerTiming();
  const userId = await timing.measure("auth", () => requireUserId());
  if (!userId) {
    return attachServerTiming(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), timing);
  }

  const response = await timing.measure("db", async () => {
    const repo = createKnowledgeBasesRepository();
    const parts = pathParts(await params);

    if (parts.length === 0) {
      return NextResponse.json(await repo.findByUserId(userId));
    }

    const [id, action] = parts;
    if (!id || parts.length > 2) return notFound();

    const base = await repo.findById(userId, id);
    if (!base) return notFound();

    if (!action) {
      return NextResponse.json(await repo.findTree(userId, id));
    }

    if (action === "contents") {
      const folderId = new URL(request.url).searchParams.get("folderId");
      return NextResponse.json(await repo.findContents(userId, id, folderId));
    }

    return notFound();
  });

  return attachServerTiming(response, timing);
}

export async function POST(request: Request, { params }: { params: Promise<KnowledgeRouteParams> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = createKnowledgeBasesRepository();
  const parts = pathParts(await params);

  try {
    if (parts.length === 0) {
      const parsed = createKnowledgeBaseSchema.safeParse(await request.json());
      if (!parsed.success) return invalid(parsed.error.issues, "Invalid knowledge base");
      return NextResponse.json(await repo.create(userId, parsed.data), { status: 201 });
    }

    const [id, section, action] = parts;
    if (!id) return notFound();

    const base = await repo.findById(userId, id);
    if (!base) return notFound();

    if (parts.length === 2 && section === "folders") {
      const parsed = createKnowledgeFolderSchema.safeParse(await request.json());
      if (!parsed.success) return invalid(parsed.error.issues, "Invalid folder");
      const folderInput = {
        name: parsed.data.name,
        ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
        ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
      };
      return NextResponse.json(await repo.createFolder(userId, id, folderInput), { status: 201 });
    }

    if (parts.length === 3 && section === "items" && action === "import") {
      const parsed = importKnowledgeItemsSchema.safeParse(await request.json());
      if (!parsed.success) return invalid(parsed.error.issues, "Invalid import");
      const importInput = {
        items: parsed.data.items,
        ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
      };
      return NextResponse.json(await repo.importItems(userId, id, importInput), { status: 201 });
    }

    if (parts.length === 3 && section === "items" && action === "asset") {
      const parsed = createKnowledgeAssetSchema.safeParse(await request.json());
      if (!parsed.success) return invalid(parsed.error.issues, "Invalid asset");
      const assetInput = {
        title: parsed.data.title,
        assetType: parsed.data.assetType,
        ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
        ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
        ...(parsed.data.sourceName !== undefined ? { sourceName: parsed.data.sourceName } : {}),
        ...(parsed.data.sourceUrl !== undefined ? { sourceUrl: parsed.data.sourceUrl } : {}),
      };
      return NextResponse.json(await repo.createAsset(userId, id, assetInput), { status: 201 });
    }
  } catch (error) {
    if (error instanceof KnowledgeFolderDepthError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return notFound();
}

export async function PATCH(request: Request, { params }: { params: Promise<KnowledgeRouteParams> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = createKnowledgeBasesRepository();
  const parts = pathParts(await params);

  const [id, section, childId] = parts;
  if (!id) return notFound();

  const base = await repo.findById(userId, id);
  if (!base) return notFound();

  if (parts.length === 1) {
    const parsed = updateKnowledgeBaseSchema.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error.issues, "Invalid knowledge base");
    const baseInput = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon } : {}),
      ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
    };
    await repo.update(userId, id, baseInput);
    return NextResponse.json({ ok: true });
  }

  if (parts.length === 3 && section === "folders" && childId) {
    const parsed = updateKnowledgeFolderSchema.safeParse(await request.json());
    if (!parsed.success) return invalid(parsed.error.issues, "Invalid folder");
    const folderInput = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
      ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
    };
    await repo.updateFolder(userId, id, childId, folderInput);
    return NextResponse.json({ ok: true });
  }

  return notFound();
}

export async function DELETE(_request: Request, { params }: { params: Promise<KnowledgeRouteParams> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = createKnowledgeBasesRepository();
  const parts = pathParts(await params);
  const [id, section, childId] = parts;
  if (!id) return notFound();

  const base = await repo.findById(userId, id);
  if (!base) return notFound();

  if (parts.length === 1) {
    await repo.delete(userId, id);
    return NextResponse.json({ ok: true });
  }

  if (parts.length === 3 && section === "folders" && childId) {
    await repo.deleteFolder(userId, id, childId);
    return NextResponse.json({ ok: true });
  }

  if (parts.length === 3 && section === "items" && childId) {
    await repo.deleteItem(userId, id, childId);
    return NextResponse.json({ ok: true });
  }

  return notFound();
}
