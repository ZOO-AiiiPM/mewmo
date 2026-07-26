/**
 * ZOO-74: Conversation Event Protocol & Transcript Types
 *
 * Stable event protocol aligned with Spec Section 8 (ZOO-63).
 * Frontend only consumes Mewmo DTOs — never raw Pi Session entries.
 */

import { z } from "zod";

import { agentActionProposalSchema, type AgentActionProposal } from "../agent-contract";

// ---------------------------------------------------------------------------
// Conversation Event Protocol (Spec §8)
// ---------------------------------------------------------------------------

export interface ToolDisplay {
  label: string;
  detail?: string;
}

export interface ActionDisplay {
  title: string;
  summary?: string;
  riskLevel: "low" | "medium" | "high";
}

export interface AssistantMessageDTO {
  id: string;
  content: string;
  status: "completed" | "failed";
  createdAt?: string;
  proposals?: AgentActionProposal[];
}

export interface UsageDTO {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  providerCostUsd?: number;
}

export interface PublicErrorDTO {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Stable ConversationEvent protocol.
 * Every event carries chatId, turnId and monotonically increasing seq.
 */
export type ConversationEvent =
  | { type: "turn.started"; chatId: string; turnId: string; seq: number }
  | { type: "assistant.text.delta"; chatId: string; turnId: string; seq: number; delta: string }
  | { type: "tool.started"; chatId: string; turnId: string; seq: number; toolCallId: string; tool: string; display?: ToolDisplay }
  | { type: "tool.completed"; chatId: string; turnId: string; seq: number; toolCallId: string; display?: ToolDisplay }
  | { type: "confirmation.required"; chatId: string; turnId: string; seq: number; actionId: string; display: ActionDisplay }
  | { type: "turn.completed"; chatId: string; turnId: string; seq: number; message: AssistantMessageDTO; usage?: UsageDTO }
  | { type: "turn.failed"; chatId: string; turnId: string; seq: number; error: PublicErrorDTO; retryable: boolean };

const eventBase = {
  chatId: z.string().min(1),
  turnId: z.string().min(1),
  seq: z.number().int().nonnegative(),
};

const toolDisplaySchema = z.object({ label: z.string(), detail: z.string().optional() });
const proposalSchema = agentActionProposalSchema;

export const conversationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("turn.started"), ...eventBase }),
  z.object({ type: z.literal("assistant.text.delta"), ...eventBase, delta: z.string() }),
  z.object({ type: z.literal("tool.started"), ...eventBase, toolCallId: z.string().min(1), tool: z.string().min(1), display: toolDisplaySchema.optional() }),
  z.object({ type: z.literal("tool.completed"), ...eventBase, toolCallId: z.string().min(1), display: toolDisplaySchema.optional() }),
  z.object({
    type: z.literal("confirmation.required"),
    ...eventBase,
    actionId: z.string().min(1),
    display: z.object({ title: z.string(), summary: z.string().optional(), riskLevel: z.enum(["low", "medium", "high"]) }),
  }),
  z.object({
    type: z.literal("turn.completed"),
    ...eventBase,
    message: z.object({
      id: z.string().min(1),
      content: z.string(),
      status: z.enum(["completed", "failed"]),
      createdAt: z.string().optional(),
      proposals: z.array(proposalSchema).optional(),
    }),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadTokens: z.number().optional(),
      cacheWriteTokens: z.number().optional(),
      reasoningTokens: z.number().optional(),
      providerCostUsd: z.number().optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal("turn.failed"),
    ...eventBase,
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
    retryable: z.boolean(),
  }),
]);

// ---------------------------------------------------------------------------
// Legacy Backend Events (current apps/agent format, pre-Agent A upgrade)
// ---------------------------------------------------------------------------

export type LegacyStreamEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean }
  | { type: "compaction" }
  | { type: "end" };

export const legacyStreamEventSchema: z.ZodType<LegacyStreamEvent> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("thinking_delta"), delta: z.string() }),
  z.object({ type: z.literal("tool_start"), toolCallId: z.string(), toolName: z.string() }),
  z.object({ type: z.literal("tool_end"), toolCallId: z.string(), toolName: z.string(), isError: z.boolean() }),
  z.object({ type: z.literal("compaction") }),
  z.object({ type: z.literal("end") }),
]);

export interface LegacyResultPayload {
  userMessage?: { id?: string; content: string; status?: string };
  assistantMessage?: { id?: string; content: string; status?: string };
  proposals?: AgentActionProposal[];
  usage?: UsageDTO;
  error?: { code?: string; message?: string; retryable?: boolean };
}

const legacyMessageSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  status: z.string().optional(),
});

const usageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  providerCostUsd: z.number().optional(),
});

export const publicErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  retryable: z.boolean().optional(),
});

export const legacyResultPayloadSchema = z.object({
  userMessage: legacyMessageSchema.optional(),
  assistantMessage: legacyMessageSchema.optional(),
  proposals: z.array(agentActionProposalSchema).optional(),
  usage: usageSchema.optional(),
  error: publicErrorSchema.optional(),
});

// ---------------------------------------------------------------------------
// Transcript Row Model
// ---------------------------------------------------------------------------

export type AssistantBlock =
  | { kind: "text"; content: string }
  | { kind: "tool"; toolCallId: string; display: string; status: "running" | "done" | "error" }
  | { kind: "thinking"; content: string }
  | { kind: "confirmation"; proposal: AgentActionProposal };

export type TranscriptRowStatus = "streaming" | "completed" | "failed";

export interface TranscriptRow {
  turnId: string;
  userContent: string;
  assistant: AssistantBlock[];
  status: TranscriptRowStatus;
  proposals: AgentActionProposal[];
  error?: { message: string; retryable: boolean };
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Chat Summary (for multi-chat switcher)
// ---------------------------------------------------------------------------

export interface ChatSummary {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Persisted Message (from GET /api/agent/chats/:id)
// ---------------------------------------------------------------------------

export interface PersistedMessage {
  id: string;
  turnId?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status?: string;
  createdAt?: string;
  metadata?: { proposals?: AgentActionProposal[] };
  error?: { message: string; retryable: boolean };
}

export interface PersistedChat {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: PersistedMessage[];
}
