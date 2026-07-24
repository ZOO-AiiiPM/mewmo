import { z } from "zod";

export const actorSchema = z.object({
  userId: z.string().min(1),
  source: z.literal("internal-agent"),
  clientId: z.string().min(1),
  scopes: z.array(z.string()).readonly(),
});

export type AgentActor = z.infer<typeof actorSchema>;

export const agentContextSchema = z
  .object({
    targetType: z.enum(["note", "clip", "feed_entry"]),
    targetId: z.string().min(1),
    draft: z
      .object({
        title: z.string().max(500).optional(),
        content: z.string().max(200_000).optional(),
        baseVersion: z.number().int().nonnegative(),
      })
      .optional(),
  })
  .nullable();

export const sendMessageBodySchema = z.object({
  clientRequestId: z.string().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  skillId: z.string().min(1).max(100).optional(),
  // Kept for one release while the Web BFF migrates to skillId.
  skill: z.enum(["general", "deep-insight"]).optional(),
  context: agentContextSchema.default(null),
}).transform((value) => ({
  ...value,
  skillId: value.skillId ?? (value.skill === "deep-insight" ? "deep-insight" : undefined),
}));

export const confirmActionBodySchema = z.object({
  executionMode: z.enum(["server", "client"]),
});

export const actionResultBodySchema = z.object({
  clientRequestId: z.string().min(8).max(128).optional(),
  status: z.enum(["succeeded", "failed"]),
  result: z.unknown().optional(),
  error: z.string().max(4_000).optional(),
});

export const clientEffectSchema = z.object({
  kind: z.literal("note_draft_patch"),
  noteId: z.string().min(1),
  title: z.string().max(500).optional(),
  content: z.string().max(200_000).optional(),
  baseVersion: z.number().int().nonnegative(),
});

export type AgentClientEffect = z.infer<typeof clientEffectSchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type ConfirmActionBody = z.infer<typeof confirmActionBodySchema>;
export type ActionResultBody = z.infer<typeof actionResultBodySchema>;

export type AgentActionStatus = "proposed" | "confirmed" | "executing" | "succeeded" | "failed" | "cancelled";

export interface AgentActionView {
  id: string;
  toolName: WriteToolName;
  preview: unknown;
  riskLevel: "low" | "medium" | "high";
  status: AgentActionStatus;
  executionMode: "server" | "client";
  clientEffect?: AgentClientEffect;
  result?: unknown;
  error?: { code: string; message: string; retryable: boolean };
}

export type AgentActionProposal = AgentActionView & { status: "proposed" };

export interface AgentCitation {
  url: string;
  title?: string;
  snippet?: string;
  /** Where the citation came from: a search hit or a fetched page. */
  source: "web_search" | "web_fetch";
}

export interface AgentMessageResponse {
  userMessage: { id: string; role: "user"; content: string; status: string; createdAt: string };
  assistantMessage: { id: string; role: "assistant"; content: string; status: string; createdAt: string };
  proposals?: AgentActionProposal[];
  citations?: AgentCitation[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens?: number;
    providerCostUsd?: number;
  };
}

export type ReadToolName = "content_search" | "content_read" | "read_current_context" | "web_search" | "web_fetch";

export type WriteToolName =
  | "note_create"
  | "note_update"
  | "note_move"
  | "note_move_to_trash"
  | "note_restore"
  | "knowledge_base_create"
  | "knowledge_base_rename"
  | "knowledge_item_move"
  | "knowledge_item_remove";

export type AgentToolName = ReadToolName | WriteToolName;

export type AgentErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "confirmation_required"
  | "timeout"
  | "rate_limited"
  | "dependency_unavailable"
  | "internal_error";

export interface AgentErrorBody {
  error: {
    code: AgentErrorCode;
    message: string;
    retryable: boolean;
    requestId?: string;
  };
}
