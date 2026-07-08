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
  createClipsRepository,
  createKnowledgeBasesRepository,
  createNotesRepository,
} from "@mewmo/db";

import { auth } from "../../../../lib/auth";

interface KnowledgeRouteParams {
  parts?: string[];
}

interface KnowledgeBaseRecord {
  id: string;
  title: string;
}

interface SeededContentRecord {
  id: string;
  title?: string | null;
  url?: string | null;
  slug?: string | null;
}

interface KnowledgeContentRecord {
  title?: string | null;
  note?: { title?: string | null } | null;
  clip?: { title?: string | null } | null;
  feedEntry?: { title?: string | null } | null;
}

interface KnowledgeFolderRecord {
  id: string;
  name: string;
}

interface PrototypeFolder {
  name: string;
  children?: PrototypeFolder[];
}

type PrototypeKnowledgeItem =
  | {
      kind: "note";
      title: string;
      slug: string;
      summary: string;
      content: string;
      position: number;
    }
  | {
      kind: "clip";
      title: string;
      url: string;
      summary: string;
      content: string;
      sourceName: string;
      position: number;
    }
  | {
      kind: "asset";
      title: string;
      summary: string;
      assetType: "pdf" | "ebook";
      position: number;
    };

const PROTOTYPE_KNOWLEDGE_BASES: Array<{
  title: string;
  icon: string;
  folders: PrototypeFolder[];
}> = [
  {
    title: "产品设计",
    icon: "book",
    folders: [
      { name: "调研" },
      {
        name: "竞品分析",
        children: [
          {
            name: "国内",
            children: [{ name: "笔记类" }, { name: "效率类" }],
          },
          { name: "海外" },
        ],
      },
      { name: "灵感" },
    ],
  },
  {
    title: "技术笔记",
    icon: "book",
    folders: [
      {
        name: "数据库",
        children: [{ name: "pgvector" }, { name: "索引优化" }],
      },
      { name: "架构" },
      { name: "部署" },
    ],
  },
];

const PROTOTYPE_KNOWLEDGE_ITEMS: Record<string, PrototypeKnowledgeItem[]> = {
  产品设计: [
    {
      kind: "note",
      title: "产品定位：一只猫的陪伴感从哪来",
      slug: "product-position-cat-companionship",
      summary: "不是把 AI 做成助手图标，而是让它像桌上真的趴着一只猫——会看你在记什么，偶尔抬头提醒你。",
      content: [
        "反复想 mewmo 到底跟 Notion、Bear、印象笔记差在哪。功能层面拼不过——大厂什么都能补齐。",
        "真正拼的是体感：打开它的时候，是面对一个冷冰冰的数据库，还是觉得「有个东西在陪我」。",
        "陪伴感不是一个功能，是无数个细节累加出来的气质。它藏在动画的缓动曲线里，藏在文案的语气里，藏在「什么时候 AI 选择闭嘴」的判断里。",
        "结论：先把单用户跑通，把这只猫的「在场 / 记忆 / 分寸」调到自己每天愿意打开，再谈别的。",
      ].join("\n\n"),
      position: 0,
    },
    {
      kind: "clip",
      title: "把信息管家做成陪伴：可爱的反义词不是严肃",
      url: "https://sspai.com",
      summary: "为什么一个有「性格」的产品反而更容易被长期使用？从工具关系聊到陪伴关系的转变。",
      content: [
        "<p>为什么一个有「性格」的产品反而更容易被长期使用？作者从工具关系聊到陪伴关系的转变。</p>",
        "<p>可爱并不等于不专业——像一个靠谱的同事，专业，但你愿意跟它多待一会儿。</p>",
        "<p>关键在分寸：卖萌过头会显得幼稚，太严肃又回到冷冰冰的工具。中间那条线，是产品的手艺。</p>",
      ].join(""),
      sourceName: "少数派",
      position: 1,
    },
    {
      kind: "clip",
      title: "Figma 如何做产品决策（设计负责人访谈）",
      url: "https://www.youtube.com/results?search_query=Figma+product+design+decision",
      summary: "从「先发散再收敛」到用原型代替评审文档，聊团队怎么把设计决策做轻。",
      content: [
        "<p>从「先发散再收敛」到用原型代替评审文档，聊团队怎么把设计决策做轻。（视频转录摘要）</p>",
        "<p>他们几乎不写长评审文档，而是直接做可点的原型让人体验，用真实反馈代替纸面辩论。</p>",
        "<p>决策权下放到最靠近问题的人，负责人只在方向和取舍上把关。</p>",
      ].join(""),
      sourceName: "YouTube",
      position: 2,
    },
    {
      kind: "asset",
      title: "Design Systems Handbook",
      summary: "设计系统从 0 到 1 的搭建：组件、令牌、文档与协作流程。",
      assetType: "pdf",
      position: 3,
    },
    {
      kind: "asset",
      title: "About Face：交互设计精髓",
      summary: "交互设计的目标、行为模型与界面细节，Alan Cooper 的经典之作。",
      assetType: "ebook",
      position: 4,
    },
  ],
};

function pathParts(params: KnowledgeRouteParams) {
  return params.parts ?? [];
}

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

async function seedPrototypeFolders(
  userId: string,
  knowledgeBaseId: string,
  folders: PrototypeFolder[],
  parentId: string | null = null,
) {
  const repo = createKnowledgeBasesRepository();

  for (const [position, folder] of folders.entries()) {
    const created = (await repo.createFolder(userId, knowledgeBaseId, {
      name: folder.name,
      parentId,
      position,
    })) as KnowledgeFolderRecord | null;
    if (created?.id && folder.children?.length) {
      await seedPrototypeFolders(userId, knowledgeBaseId, folder.children, created.id);
    }
  }
}

function knowledgeContentTitle(item: KnowledgeContentRecord) {
  return item.note?.title ?? item.clip?.title ?? item.feedEntry?.title ?? item.title ?? "";
}

async function ensurePrototypeNote(
  userId: string,
  item: Extract<PrototypeKnowledgeItem, { kind: "note" }>,
) {
  const notes = createNotesRepository();
  const existing = (await notes.findBySlug(userId, item.slug)) as SeededContentRecord | null;
  if (existing) return existing;
  return (await notes.create(userId, {
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    content: item.content,
  })) as SeededContentRecord;
}

async function ensurePrototypeClip(
  userId: string,
  item: Extract<PrototypeKnowledgeItem, { kind: "clip" }>,
  existingClips: SeededContentRecord[],
) {
  const existing = existingClips.find((clip) => clip.title === item.title || clip.url === item.url);
  if (existing) return existing;

  const clips = createClipsRepository();
  const created = (await clips.create(userId, {
    url: item.url,
    title: item.title,
    summary: item.summary,
    excerpt: item.summary,
    content: item.content,
    sourceName: item.sourceName,
  })) as SeededContentRecord;
  existingClips.push(created);
  return created;
}

async function seedPrototypeKnowledgeItems(userId: string, knowledgeBase: KnowledgeBaseRecord) {
  const prototypeItems = PROTOTYPE_KNOWLEDGE_ITEMS[knowledgeBase.title] ?? [];
  if (prototypeItems.length === 0) return;

  const knowledge = createKnowledgeBasesRepository();
  const contents = (await knowledge.findContents(userId, knowledgeBase.id, null)) as KnowledgeContentRecord[];
  const existingTitles = new Set(contents.map(knowledgeContentTitle).filter(Boolean));
  const missingItems = prototypeItems.filter((item) => !existingTitles.has(item.title));
  if (missingItems.length === 0) return;

  const clips = createClipsRepository();
  const existingClips = (await clips.findByUserId(userId)) as SeededContentRecord[];
  const itemsToImport: Array<
    | { kind: "note"; noteId: string }
    | { kind: "clip"; clipId: string }
  > = [];

  for (const item of missingItems) {
    if (item.kind === "note") {
      const note = await ensurePrototypeNote(userId, item);
      itemsToImport.push({ kind: "note", noteId: note.id });
      continue;
    }

    if (item.kind === "clip") {
      const clip = await ensurePrototypeClip(userId, item, existingClips);
      itemsToImport.push({ kind: "clip", clipId: clip.id });
      continue;
    }

    await knowledge.createAsset(userId, knowledgeBase.id, {
      assetType: item.assetType,
      title: item.title,
      summary: item.summary,
      sourceName: "从本地导入",
      position: item.position,
    });
  }

  if (itemsToImport.length > 0) {
    await knowledge.importItems(userId, knowledgeBase.id, { items: itemsToImport });
  }
}

async function ensurePrototypeKnowledgeBases(userId: string) {
  const repo = createKnowledgeBasesRepository();
  const existing = (await repo.findByUserId(userId)) as KnowledgeBaseRecord[];
  if (existing.length > 0) {
    for (const base of existing) {
      await seedPrototypeKnowledgeItems(userId, base);
    }
    return (await repo.findByUserId(userId)) as KnowledgeBaseRecord[];
  }

  const createdBases: KnowledgeBaseRecord[] = [];
  for (const [position, item] of PROTOTYPE_KNOWLEDGE_BASES.entries()) {
    const created = (await repo.create(userId, {
      title: item.title,
      icon: item.icon,
      position,
    })) as KnowledgeBaseRecord;
    createdBases.push(created);
    await seedPrototypeFolders(userId, created.id, item.folders);
    await seedPrototypeKnowledgeItems(userId, created);
  }

  return (await repo.findByUserId(userId)) as KnowledgeBaseRecord[];
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function invalid(error: unknown, label: string) {
  return NextResponse.json({ error: label, issues: error }, { status: 400 });
}

export async function GET(request: Request, { params }: { params: Promise<KnowledgeRouteParams> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = createKnowledgeBasesRepository();
  const parts = pathParts(await params);

  if (parts.length === 0) {
    return NextResponse.json(await ensurePrototypeKnowledgeBases(userId));
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
