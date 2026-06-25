import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const urlSchema = z.url();

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

