import { z } from "zod";

export const agentResourceSchema = z.object({
  type: z.enum(["note", "clip", "feed_entry", "knowledge_base"]),
  id: z.string().min(1),
  title: z.string().max(500).optional(),
});

export const agentNoteDraftSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  title: z.string().max(500),
  content: z.string().max(200_000),
});

export const agentMessageRequestSchema = z.object({
  clientRequestId: z.string().min(8).max(128),
  content: z.string().trim().min(1).max(8000),
  skillId: z.string().min(1).max(80).optional(),
  context: z
    .object({
      resource: agentResourceSchema,
      draft: agentNoteDraftSchema.optional(),
    })
    .nullable()
    .optional(),
});

export const agentActionCommandSchema = z.object({
  clientRequestId: z.string().min(8).max(128),
  executionMode: z.enum(["server", "client"]).optional(),
});

export const agentChatCreateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  default: z.boolean().optional(),
});

export interface AgentErrorPayload {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId?: string;
  };
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
  createdAt?: string;
}

export type AgentActionStatus =
  | "proposed"
  | "confirmed"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AgentActionProposal {
  id: string;
  toolName: string;
  status: AgentActionStatus;
  riskLevel: "low" | "medium" | "high";
  preview: {
    title: string;
    summary?: string;
    diff?: string;
    targets?: Array<{ type: string; id: string; title?: string }>;
  };
  clientEffect?: {
    kind: "note_draft_patch";
    noteId: string;
    baseVersion: number;
    title?: string;
    content?: string;
  };
  error?: { code: string; message: string; retryable: boolean };
}

export interface AgentMessageResponse {
  userMessage: Pick<AgentChatMessage, "content"> & Partial<AgentChatMessage> & { clientRequestId?: string };
  assistantMessage: Pick<AgentChatMessage, "content"> & Partial<AgentChatMessage>;
  proposals?: AgentActionProposal[];
}

export function agentError(
  code: string,
  message: string,
  retryable: boolean,
  requestId?: string,
): AgentErrorPayload {
  return { error: { code, message, retryable, ...(requestId ? { requestId } : {}) } };
}
