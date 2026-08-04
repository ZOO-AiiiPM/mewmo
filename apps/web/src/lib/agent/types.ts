/**
 * ZOO-74: Conversation Event Protocol & Transcript Types
 *
 * Stable event protocol aligned with Spec Section 8 (ZOO-63).
 * Frontend only consumes Mewmo DTOs — never raw Pi Session entries.
 */

import { agentConversationEventSchema, type AgentConversationEvent } from "@mewmo/shared";
import { z } from "zod";

import { agentActionProposalSchema, type AgentActionProposal } from "../agent-contract";

// ---------------------------------------------------------------------------
// Conversation Event Protocol (Spec §8)
// ---------------------------------------------------------------------------

export interface UsageDTO {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  providerCostUsd?: number;
}

/**
 * Stable ConversationEvent protocol.
 * Every event carries chatId, turnId and monotonically increasing seq.
 */
export type ConversationEvent = AgentConversationEvent;
export const conversationEventSchema = agentConversationEventSchema;

// ---------------------------------------------------------------------------
// Legacy Backend Events (current apps/agent format, pre-Agent A upgrade)
// ---------------------------------------------------------------------------

export type LegacyStreamEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; details?: string[] | undefined }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean; details?: string[] | undefined }
  | { type: "compaction" }
  | { type: "end" };

export const legacyStreamEventSchema: z.ZodType<LegacyStreamEvent> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("thinking_delta"), delta: z.string() }),
  z.object({ type: z.literal("tool_start"), toolCallId: z.string(), toolName: z.string(), details: z.array(z.string()).optional() }),
  z.object({ type: z.literal("tool_end"), toolCallId: z.string(), toolName: z.string(), isError: z.boolean(), details: z.array(z.string()).optional() }),
  z.object({ type: z.literal("compaction") }),
  z.object({ type: z.literal("end") }),
]);

export interface LegacyResultPayload {
  userMessage?: { id?: string; content: string; status?: string };
  assistantMessage?: { id?: string; content: string; status?: string };
  proposals?: AgentActionProposal[];
  totalTokens?: number;
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
  totalTokens: z.number().int().nonnegative().optional(),
  usage: usageSchema.optional(),
  error: publicErrorSchema.optional(),
});

// ---------------------------------------------------------------------------
// Transcript Row Model
// ---------------------------------------------------------------------------

export type AssistantBlock =
  | { kind: "text"; content: string }
  | { kind: "tool"; toolCallId: string; toolName?: string; display: string; details?: string[]; status: "running" | "done" | "error" }
  | { kind: "thinking"; content: string }
  | { kind: "confirmation"; proposal: AgentActionProposal };

export type TranscriptRowStatus = "streaming" | "completed" | "failed";

/**
 * #6: context chip shown on the user message when the message was sent with
 * a page context attached (note / clip / feed entry).
 */
export interface TranscriptContextChip {
  kind: string;
  title: string;
}

export interface TranscriptRow {
  turnId: string;
  userContent: string;
  assistant: AssistantBlock[];
  status: TranscriptRowStatus;
  proposals: AgentActionProposal[];
  totalTokens?: number;
  contextChip?: TranscriptContextChip;
  error?: { message: string; retryable: boolean };
  /** True when the user stopped generation client-side (reply may be partial). */
  stopped?: boolean;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Chat Summary (for multi-chat switcher)
// ---------------------------------------------------------------------------

export interface ChatSummary {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  /** Total persisted messages; lets the UI reuse an untouched chat and hide never-used chats. */
  messageCount?: number;
  /** First user message text; fallback list title when title is still the default. */
  preview?: string;
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
  metadata?: {
    proposals?: AgentActionProposal[];
    thinking?: boolean;
    process?: PersistedProcessBlock[];
    startedAt?: string;
    completedAt?: string;
    totalTokens?: number;
  };
  /** Persisted context attachments (targetType + title) captured at send time. */
  contextAttachments?: Array<{ targetType: string; title: string }>;
  error?: { message: string; retryable: boolean };
}

export type PersistedProcessBlock =
  | { kind: "text"; content: string }
  | { kind: "thinking"; content: string }
  | { kind: "tool"; toolCallId: string; toolName: string; details?: string[]; status: "running" | "done" | "error" };

export interface PersistedChat {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: PersistedMessage[];
}
