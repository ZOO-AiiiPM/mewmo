import { ensureOnboardingNotes } from "./onboarding";

const LEGACY_KNOWLEDGE_BASE_TITLES = ["产品设计", "技术笔记"] as const;
const LEGACY_FOLDER_NAMES = new Set([
  "调研",
  "竞品分析",
  "国内",
  "笔记类",
  "效率类",
  "海外",
  "灵感",
  "数据库",
  "pgvector",
  "索引优化",
  "架构",
  "部署",
]);
const LEGACY_NOTE_SLUG = "product-position-cat-companionship";
const LEGACY_CLIPS = [
  {
    title: "把信息管家做成陪伴：可爱的反义词不是严肃",
    url: "https://sspai.com",
  },
  {
    title: "Figma 如何做产品决策（设计负责人访谈）",
    url: "https://www.youtube.com/results?search_query=Figma+product+design+decision",
  },
] as const;
const LEGACY_ASSET_TITLES = new Set([
  "Design Systems Handbook",
  "About Face：交互设计精髓",
]);

interface LegacyKnowledgeBaseCandidate {
  title: string;
  folders: Array<{ name: string }>;
  items: Array<{
    title?: string | null;
    sourceName?: string | null;
    note?: { slug: string } | null;
    clip?: { title: string; url: string } | null;
  }>;
}

interface CleanupClient {
  user: { findMany(args: unknown): Promise<Array<{ id: string }>> };
  knowledgeBase: {
    findMany(args: unknown): Promise<Array<LegacyKnowledgeBaseCandidate & { id: string }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  note: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  clip: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

interface CleanupOptions {
  apply?: boolean;
  ensureNotes?: typeof ensureOnboardingNotes;
}

export interface PrototypeCleanupReport {
  users: number;
  knowledgeBasesMatched: number;
  legacyNotesMatched: number;
  legacyClipsMatched: number;
  knowledgeBasesDeleted: number;
  legacyNotesDeleted: number;
  legacyClipsDeleted: number;
  onboardingNotesCreated: number;
}

function isLegacyClip(clip: { title: string; url: string }) {
  return LEGACY_CLIPS.some(
    (candidate) => candidate.title === clip.title && candidate.url === clip.url,
  );
}

export function isLegacyPrototypeKnowledgeBase(
  candidate: LegacyKnowledgeBaseCandidate,
) {
  if (!LEGACY_KNOWLEDGE_BASE_TITLES.includes(
    candidate.title as (typeof LEGACY_KNOWLEDGE_BASE_TITLES)[number],
  )) {
    return false;
  }

  if (candidate.folders.some((folder) => LEGACY_FOLDER_NAMES.has(folder.name))) {
    return true;
  }

  return candidate.items.some((item) => {
    if (item.note?.slug === LEGACY_NOTE_SLUG) return true;
    if (item.clip && isLegacyClip(item.clip)) return true;
    return (
      item.sourceName === "从本地导入" &&
      Boolean(item.title && LEGACY_ASSET_TITLES.has(item.title))
    );
  });
}

export async function cleanupPrototypeOnboarding(
  client: CleanupClient,
  options: CleanupOptions = {},
): Promise<PrototypeCleanupReport> {
  const apply = options.apply ?? false;
  const ensureNotes = options.ensureNotes ?? ensureOnboardingNotes;
  const [users, knowledgeBases, notes, clips] = await Promise.all([
    client.user.findMany({ select: { id: true } }),
    client.knowledgeBase.findMany({
      where: { title: { in: [...LEGACY_KNOWLEDGE_BASE_TITLES] } },
      select: {
        id: true,
        title: true,
        folders: { select: { name: true } },
        items: {
          select: {
            title: true,
            sourceName: true,
            note: { select: { slug: true } },
            clip: { select: { title: true, url: true } },
          },
        },
      },
    }),
    client.note.findMany({
      where: { slug: LEGACY_NOTE_SLUG },
      select: { id: true },
    }),
    client.clip.findMany({
      where: { OR: LEGACY_CLIPS.map((clip) => ({ ...clip })) },
      select: { id: true },
    }),
  ]);

  const matchedKnowledgeBaseIds = knowledgeBases
    .filter(isLegacyPrototypeKnowledgeBase)
    .map((item) => item.id);
  const noteIds = notes.map((item) => item.id);
  const clipIds = clips.map((item) => item.id);
  const report: PrototypeCleanupReport = {
    users: users.length,
    knowledgeBasesMatched: matchedKnowledgeBaseIds.length,
    legacyNotesMatched: noteIds.length,
    legacyClipsMatched: clipIds.length,
    knowledgeBasesDeleted: 0,
    legacyNotesDeleted: 0,
    legacyClipsDeleted: 0,
    onboardingNotesCreated: 0,
  };

  if (!apply) return report;

  if (matchedKnowledgeBaseIds.length > 0) {
    report.knowledgeBasesDeleted = (
      await client.knowledgeBase.deleteMany({
        where: { id: { in: matchedKnowledgeBaseIds } },
      })
    ).count;
  }
  if (noteIds.length > 0) {
    report.legacyNotesDeleted = (
      await client.note.deleteMany({ where: { id: { in: noteIds } } })
    ).count;
  }
  if (clipIds.length > 0) {
    report.legacyClipsDeleted = (
      await client.clip.deleteMany({ where: { id: { in: clipIds } } })
    ).count;
  }

  for (const user of users) {
    const result = await ensureNotes(client, user.id);
    report.onboardingNotesCreated += result.created;
  }

  return report;
}
