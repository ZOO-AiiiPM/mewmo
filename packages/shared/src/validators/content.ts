import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const urlSchema = z.url();
export const feedTypeSchema = z.enum(["article", "media", "video", "podcast"]);
export const knowledgeItemKindSchema = z.enum(["note", "clip", "feed_entry", "asset"]);
export const knowledgeAssetTypeSchema = z.enum(["pdf", "ebook"]);
const nonEmptyUpdate = (value: Record<string, unknown>) =>
  Object.values(value).some((item) => item !== undefined);

export const createNoteSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  content: z.string(),
  summary: z.string().optional(),
  pinned: z.boolean().optional().default(false),
  tags: z.array(z.string().min(1)).optional().default([]),
});

export const updateNoteSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    summary: z.string().optional(),
    pinned: z.boolean().optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "at least one field must be provided",
  });

export const updateClipSchema = z
  .object({
    url: urlSchema.optional(),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    summary: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    coverImage: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    sourceName: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    publishedAt: z.coerce.date().nullable().optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const createClipSchema = z.object({
  url: urlSchema,
  title: z.string().min(1),
  content: z.string().optional().default(""),
  summary: z.string().optional(),
  favicon: z.string().optional(),
  coverImage: z.string().optional(),
  excerpt: z.string().optional(),
  sourceName: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
});

export const createFeedSchema = z.object({
  url: urlSchema,
  type: feedTypeSchema.optional().default("article"),
  title: z.string().min(1),
  description: z.string().optional(),
  favicon: z.string().optional(),
  refreshInterval: z.number().int().positive().optional().default(3600),
});

export const updateFeedSchema = z
  .object({
    url: urlSchema.optional(),
    type: feedTypeSchema.optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    favicon: z.string().nullable().optional(),
    refreshInterval: z.number().int().positive().optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const createFeedEntrySchema = z.object({
  feedId: z.string().min(1),
  title: z.string().min(1),
  url: urlSchema,
  content: z.string(),
  summary: z.string().optional(),
  coverImage: z.string().optional(),
  excerpt: z.string().optional(),
  sourceName: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
});

export const updateFeedEntrySchema = z
  .object({
    title: z.string().min(1).optional(),
    url: urlSchema.optional(),
    content: z.string().optional(),
    summary: z.string().nullable().optional(),
    coverImage: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    sourceName: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    publishedAt: z.coerce.date().nullable().optional(),
    readAt: z.coerce.date().nullable().optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const videoPlatformSchema = z.enum(["bilibili", "youtube"]);
export const videoProcessingStatusSchema = z.enum([
  "fetching_metadata",
  "fetching_transcript",
  "analyzing",
  "ready",
  "no_transcript",
  "failed",
]);

export const videoTranscriptSegmentSchema = z
  .object({
    startSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().min(0),
    text: z.string().trim().min(1),
  })
  .refine((segment) => segment.endSeconds > segment.startSeconds, {
    message: "transcript endSeconds must be greater than startSeconds",
    path: ["endSeconds"],
  });

export const videoTranscriptSchema = z.array(videoTranscriptSegmentSchema);

export const videoQuickJudgmentSchema = z.object({
  summary: z.string().trim().min(1),
  highlights: z.array(z.string().trim().min(1)).max(12),
  thoughts: z.array(z.string().trim().min(1)).max(12),
  terms: z.array(z.object({
    term: z.string().trim().min(1).max(80),
    explanation: z.string().trim().min(1).max(600),
  })).max(20),
});

export const videoChapterSchema = z
  .object({
    startSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().min(0).nullable(),
    title: z.string().trim().min(1).max(180),
    theme: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(2000),
  })
  .refine((chapter) => chapter.endSeconds === null || chapter.endSeconds > chapter.startSeconds, {
    message: "chapter endSeconds must be greater than startSeconds",
    path: ["endSeconds"],
  });

export const videoAiHighlightSchema = z.object({
  startSeconds: z.number().finite().min(0),
  title: z.string().trim().min(1).max(180),
  note: z.string().trim().min(1).max(2000),
  score: z.number().int().min(0).max(100).optional(),
});

export const videoAnalysisResultSchema = z.object({
  schemaVersion: z.literal(1),
  quickJudgment: videoQuickJudgmentSchema,
  keyPoints: z.array(z.string().trim().min(1)).max(20),
  targetAudience: z.string().trim().min(1).max(600).nullable(),
  chapters: z.array(videoChapterSchema).max(100),
  highlights: z.array(videoAiHighlightSchema).max(100),
  suggestedTags: z.array(z.string().trim().min(1).max(50)).max(20),
});

export const createVideoSchema = z.object({
  url: urlSchema,
});

export const createVideoHighlightSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  startSeconds: z.number().finite().min(0).nullable().optional(),
});

export const replaceFeedEntryTagsSchema = z.object({
  tags: z.array(z.object({
    name: z.string().trim().min(1).max(50),
    color: z.string().trim().min(1).max(32).optional(),
  })).max(50),
});

export type VideoPlatform = z.infer<typeof videoPlatformSchema>;
export type VideoProcessingStatus = z.infer<typeof videoProcessingStatusSchema>;
export type VideoTranscriptSegment = z.infer<typeof videoTranscriptSegmentSchema>;
export type VideoAnalysisResult = z.infer<typeof videoAnalysisResultSchema>;

export const createKnowledgeBaseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40).optional().default("book"),
});

export const updateKnowledgeBaseSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    icon: z.string().trim().min(1).max(40).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const createKnowledgeFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().min(1).nullable().optional(),
  depth: z.number().int().min(0).max(3).optional(),
  position: z.number().int().min(0).optional(),
});

export const updateKnowledgeFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    parentId: z.string().min(1).nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

const importKnowledgeNoteSchema = z.object({
  kind: z.literal("note"),
  noteId: z.string().min(1),
});

const importKnowledgeClipSchema = z.object({
  kind: z.literal("clip"),
  clipId: z.string().min(1),
});

const importKnowledgeFeedEntrySchema = z.object({
  kind: z.literal("feed_entry"),
  feedEntryId: z.string().min(1),
});

export const importKnowledgeItemsSchema = z.object({
  folderId: z.string().min(1).nullable().optional(),
  items: z
    .array(
      z.discriminatedUnion("kind", [
        importKnowledgeNoteSchema,
        importKnowledgeClipSchema,
        importKnowledgeFeedEntrySchema,
      ]),
    )
    .min(1),
});

export const createKnowledgeAssetSchema = z.object({
  folderId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(2000).nullable().optional(),
  assetType: knowledgeAssetTypeSchema,
  sourceName: z.string().trim().max(120).nullable().optional(),
  sourceUrl: urlSchema.nullable().optional(),
});

export const syncEntitySchema = z.enum(["note", "clip", "feed", "feed_entry"]);
export const discoverFeedSchema = z.object({
  query: z.string().trim().min(1),
});
export const syncOperationSchema = z.enum([
  "create",
  "update",
  "delete",
  "mark_read",
  "mark_unread",
]);

export const syncMutationSchema = z.object({
  entity: syncEntitySchema,
  op: syncOperationSchema,
  id: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const syncPullSchema = z.object({
  cursor: z.string().datetime().optional(),
});

export const syncPushSchema = z.object({
  mutations: z.array(syncMutationSchema).min(1),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(50).refine((value) => !value.includes(" "), "tags cannot contain spaces"),
  color: z.string().optional(),
  isSystem: z.boolean().optional().default(false),
});

export const createChatSchema = z.object({
  title: z.string().min(1),
});

export const createMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
