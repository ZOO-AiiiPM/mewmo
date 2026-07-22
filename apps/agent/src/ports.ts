import type {
  ActionResultBody,
  AgentActionProposal,
  AgentActionView,
  AgentActor,
  AgentClientEffect,
  AgentMessageResponse,
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
  turnId: string;
  toolCallId: string;
  clientRequestId: string;
  toolName: WriteToolName;
  input: unknown;
  preview: unknown;
  riskLevel: "low" | "medium" | "high";
  expectedVersion?: number;
  idempotencyKey: string;
  clientEffect?: AgentClientEffect;
}

export interface ActionPort {
  propose(input: ProposeActionInput): Promise<AgentActionProposal>;
  get(input: { actor: AgentActor; actionId: string }): Promise<AgentActionView>;
  confirm(input: { actor: AgentActor; actionId: string; executionMode: "server" | "client" }): Promise<AgentActionView>;
  cancel(input: { actor: AgentActor; actionId: string }): Promise<AgentActionView>;
  retry(input: { actor: AgentActor; actionId: string; executionMode: "server" | "client" }): Promise<AgentActionView>;
  reportResult(input: { actor: AgentActor; actionId: string } & ActionResultBody): Promise<AgentActionView>;
}

export interface SessionEntryRecord {
  entryId: string;
  entrySeq: number;
  parentId: string | null;
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface SessionUsageInput {
  purpose: string;
  operation: string;
  provider: string;
  requestedModel: string;
  responseModel?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  providerCostUsd?: number;
  priceSnapshot?: unknown;
}

export interface ApplicationPort {
  turns: {
    begin(input: {
      actor: AgentActor;
      chatId: string;
      clientRequestId: string;
      content: string;
      workerId: string;
      leaseMs: number;
    }): Promise<{ turnId: string; cached?: AgentMessageResponse }>;
    complete(input: {
      actor: AgentActor;
      turnId: string;
      workerId: string;
      assistantEntryId: string;
      proposals: AgentActionProposal[];
    }): Promise<AgentMessageResponse>;
    fail(input: {
      actor: AgentActor;
      turnId: string;
      workerId: string;
      code: string;
      message: string;
      interrupted?: boolean;
    }): Promise<void>;
  };
  sessions: {
    metadata(input: { actor: AgentActor; chatId: string }): Promise<{ id: string; createdAt: string; activeLeafId: string | null }>;
    append(input: {
      actor: AgentActor;
      chatId: string;
      turnId: string;
      entry: Omit<SessionEntryRecord, "entrySeq">;
      usage?: SessionUsageInput;
    }): Promise<SessionEntryRecord>;
    get(input: { actor: AgentActor; chatId: string; entryId: string }): Promise<SessionEntryRecord | undefined>;
    list(input: { actor: AgentActor; chatId: string; afterEntrySeq?: number; limit?: number; type?: string }): Promise<SessionEntryRecord[]>;
  };
  skills: {
    list(input: { actor: AgentActor }): Promise<Array<{
      id: string;
      name: string;
      description: string;
      content: string;
      modelPurpose: "agent.chat" | "agent.deep_insight";
      allowedTools: string[];
    }>>;
  };
  content: {
    search(actor: AgentActor, input: ContentSearchInput): Promise<ContentSearchResult>;
    read(actor: AgentActor, resourceUri: string, maxChars: number): Promise<ContentReadResult>;
  };
  actions: ActionPort;
}

export type AgentRuntimeEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean }
  | { type: "compaction" }
  | { type: "end" };

export interface AgentRequestContext {
  actor: AgentActor;
  chatId: string;
  turnId: string;
  workerId: string;
  request: SendMessageBody;
}

export interface AgentRuntimePort {
  run(context: AgentRequestContext, onEvent?: (event: AgentRuntimeEvent) => Promise<void> | void): Promise<{
    text: string;
    proposals: AgentActionProposal[];
    userEntryId: string;
    assistantEntryId: string;
    usage?: AgentMessageResponse["usage"];
  }>;
}
