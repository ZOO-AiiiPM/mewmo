import type { LanguageModel } from "ai";
import type {
  ActionResultBody,
  AgentActionProposal,
  AgentActor,
  AgentClientEffect,
  SendMessageBody,
  WriteToolName,
} from "./contracts";

export interface ContentSearchInput {
  query: string;
  types?: Array<"note" | "clip" | "feed_entry">;
  limit: number;
  cursor?: string;
}

export interface ContentSearchResult {
  items: Array<{
    resourceUri: string;
    type: "note" | "clip" | "feed_entry";
    id: string;
    title: string;
    snippet?: string;
    updatedAt?: string;
    version?: number;
  }>;
  nextCursor?: string;
}

export interface ContentReadResult {
  resourceUri: string;
  type: "note" | "clip" | "feed_entry";
  id: string;
  title: string;
  content: string;
  version?: number;
}

export interface ProposeActionInput {
  actor: AgentActor;
  chatId: string;
  clientRequestId: string;
  toolName: WriteToolName;
  input: unknown;
  preview: unknown;
  riskLevel: "low" | "medium" | "high";
  expectedVersion?: number;
  idempotencyKey: string;
  clientEffect?: AgentClientEffect;
}

export interface ConfirmedAction {
  id: string;
  status: "confirmed" | "executing" | "succeeded";
  executionMode: "server" | "client";
  clientEffect?: AgentClientEffect;
  result?: unknown;
}

export interface ActionPort {
  propose(input: ProposeActionInput): Promise<AgentActionProposal>;
  confirm(input: { actor: AgentActor; actionId: string; executionMode: "server" | "client" }): Promise<ConfirmedAction>;
  cancel(input: { actor: AgentActor; actionId: string }): Promise<{ id: string; status: "cancelled" }>;
  retry(input: { actor: AgentActor; actionId: string; executionMode?: "server" | "client" }): Promise<ConfirmedAction>;
  reportResult(input: { actor: AgentActor; actionId: string } & ActionResultBody): Promise<{ id: string; status: "succeeded" | "failed" }>;
}

export interface ApplicationPort {
  chats: {
    prepareTurn(input: {
      actor: AgentActor;
      chatId: string;
      clientRequestId: string;
      content: string;
    }): Promise<{
      history: Array<{ role: "user" | "assistant"; content: string }>;
      userMessage: { id: string; role: "user"; content: string; status: string; createdAt: string };
      cached?: {
        assistantMessage: { id: string; role: "assistant"; content: string; status: string; createdAt: string };
        proposals?: AgentActionProposal[];
        usage?: { inputTokens?: number; outputTokens?: number };
      };
    }>;
    completeTurn(input: {
      actor: AgentActor;
      chatId: string;
      clientRequestId: string;
      content: string;
      proposals: AgentActionProposal[];
      usage?: { inputTokens?: number; outputTokens?: number };
    }): Promise<{ id: string; role: "assistant"; content: string; status: string; createdAt: string }>;
  };
  content: {
    search(actor: AgentActor, input: ContentSearchInput): Promise<ContentSearchResult>;
    read(actor: AgentActor, resourceUri: string, maxChars: number): Promise<ContentReadResult>;
  };
  actions: ActionPort;
}

export interface AgentModelPort {
  languageModel(purpose: "agent.chat" | "agent.deep_insight"): LanguageModel;
}

export interface AgentRequestContext {
  actor: AgentActor;
  chatId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  request: SendMessageBody;
}

export interface AgentRuntimePort {
  run(context: AgentRequestContext): Promise<{
    text: string;
    proposals: AgentActionProposal[];
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
}
