import { z } from "zod";

const eventIdentitySchema = z.object({
  chatId: z.string().min(1),
  turnId: z.string().min(1),
  seq: z.number().int().positive(),
});

export const agentUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  providerCostUsd: z.number().nonnegative().optional(),
});

export const agentAssistantMessageSchema = z.object({
  id: z.string().min(1),
  role: z.literal("assistant"),
  content: z.string(),
  status: z.string().min(1),
  createdAt: z.string().min(1),
});

const toolDisplaySchema = z.object({
  label: z.string().min(1),
});

const actionDisplaySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  riskLevel: z.enum(["low", "medium", "high"]),
});

const publicErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const agentConversationEventSchema = z.discriminatedUnion("type", [
  eventIdentitySchema.extend({ type: z.literal("turn.started") }),
  eventIdentitySchema.extend({
    type: z.literal("assistant.text.delta"),
    delta: z.string(),
  }),
  eventIdentitySchema.extend({
    type: z.literal("assistant.thinking.delta"),
    delta: z.string(),
  }),
  eventIdentitySchema.extend({
    type: z.literal("tool.started"),
    toolCallId: z.string().min(1),
    tool: z.string().min(1),
    display: toolDisplaySchema.optional(),
  }),
  eventIdentitySchema.extend({
    type: z.literal("tool.completed"),
    toolCallId: z.string().min(1),
    display: toolDisplaySchema.optional(),
  }),
  eventIdentitySchema.extend({
    type: z.literal("confirmation.required"),
    actionId: z.string().min(1),
    display: actionDisplaySchema,
  }),
  eventIdentitySchema.extend({
    type: z.literal("turn.completed"),
    message: agentAssistantMessageSchema,
    usage: agentUsageSchema.optional(),
  }),
  eventIdentitySchema.extend({
    type: z.literal("turn.failed"),
    error: publicErrorSchema,
    retryable: z.boolean(),
  }),
]);

export type AgentConversationEvent = z.infer<typeof agentConversationEventSchema>;

