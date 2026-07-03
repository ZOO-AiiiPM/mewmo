import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const urlSchema = z.url();
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
    tags: z.array(z.string().min(1)).optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const createClipSchema = z.object({
  url: urlSchema,
  title: z.string().min(1),
  content: z.string(),
  summary: z.string().optional(),
  favicon: z.string().optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
});

export const createFeedSchema = z.object({
  url: urlSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  favicon: z.string().optional(),
  refreshInterval: z.number().int().positive().optional().default(3600),
});

export const updateFeedSchema = z
  .object({
    url: urlSchema.optional(),
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
  author: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
});

export const updateFeedEntrySchema = z
  .object({
    title: z.string().min(1).optional(),
    url: urlSchema.optional(),
    content: z.string().optional(),
    summary: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    publishedAt: z.coerce.date().nullable().optional(),
    readAt: z.coerce.date().nullable().optional(),
  })
  .refine(nonEmptyUpdate, { message: "at least one field must be provided" });

export const syncEntitySchema = z.enum(["note", "clip", "feed", "feed_entry"]);
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
