import { z } from "zod";

export const aiTargetTypeSchema = z.enum(["note", "clip", "feed_entry"]);
export type AiTargetTypeValue = z.infer<typeof aiTargetTypeSchema>;

export const aiRunKindSchema = z.enum(["summary", "embedding", "relation", "note_insight"]);
export type AiRunKindValue = z.infer<typeof aiRunKindSchema>;

export const aiRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "superseded"]);
export type AiRunStatusValue = z.infer<typeof aiRunStatusSchema>;

export const aiActionRiskLevelSchema = z.enum(["write", "destructive"]);
export type AiActionRiskLevelValue = z.infer<typeof aiActionRiskLevelSchema>;

export const aiActionExecutionModeSchema = z.enum(["server", "client"]);
export type AiActionExecutionModeValue = z.infer<typeof aiActionExecutionModeSchema>;

export const aiActionStatusSchema = z.enum([
  "proposed",
  "confirmed",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AiActionStatusValue = z.infer<typeof aiActionStatusSchema>;

export const modelPurposeSchema = z.enum([
  "agent.chat",
  "agent.deep_insight",
  "workflow.summary",
  "workflow.recommendation",
  "workflow.embedding",
  "workflow.note_insight",
  "eval.judge",
]);
export type ModelPurposeValue = z.infer<typeof modelPurposeSchema>;

export const enqueueAiRunSchema = z.object({
  userId: z.string().min(1),
  kind: aiRunKindSchema,
  targetType: aiTargetTypeSchema,
  targetId: z.string().min(1),
  inputVersion: z.number().int().positive(),
  inputHash: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  availableAt: z.coerce.date().optional(),
  idempotencyKey: z.string().min(1).optional(),
});
export type EnqueueAiRunDto = z.infer<typeof enqueueAiRunSchema>;

export const proposeAiActionSchema = z.object({
  userId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  preview: z.record(z.string(), z.unknown()),
  riskLevel: aiActionRiskLevelSchema.default("write"),
  executionMode: aiActionExecutionModeSchema.default("server"),
  clientEffect: z.record(z.string(), z.unknown()).optional(),
  expectedVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(1),
});
export type ProposeAiActionDto = z.infer<typeof proposeAiActionSchema>;

export const noteCreateCommandSchema = z.object({
  title: z.string().trim().min(1).max(500),
  content: z.string().default(""),
  slug: z.string().trim().min(1).max(600).optional(),
  idempotencyKey: z.string().min(1),
  actionId: z.string().min(1).optional(),
});
export type NoteCreateCommandDto = z.infer<typeof noteCreateCommandSchema>;

export const noteUpdateCommandSchema = z.object({
  noteId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  patch: z.object({
    title: z.string().trim().min(1).max(500).optional(),
    content: z.string().optional(),
    pinned: z.boolean().optional(),
  }).refine((patch) => Object.keys(patch).length > 0, "patch cannot be empty"),
  idempotencyKey: z.string().min(1),
  actionId: z.string().min(1).optional(),
});
export type NoteUpdateCommandDto = z.infer<typeof noteUpdateCommandSchema>;

export const noteVersionCommandSchema = z.object({
  noteId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  actionId: z.string().min(1).optional(),
});
export type NoteVersionCommandDto = z.infer<typeof noteVersionCommandSchema>;
