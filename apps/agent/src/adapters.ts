import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import {
  DomainError,
  createActor,
  createAiActionService,
  createAiChatService,
  createContentService,
  createKnowledgeService,
  createNoteService,
  type Actor,
} from "@mewmo/application";
import { AgentError } from "./errors";
import type { AgentActionProposal, AgentActionView, AgentActor, AgentClientEffect, WriteToolName } from "./contracts";
import type { AgentModelPort, ApplicationPort, ProposeActionInput } from "./ports";

export interface FoundationAdapters {
  models: AgentModelPort;
  application: ApplicationPort;
}

export async function loadFoundationAdapters(): Promise<FoundationAdapters> {
  const runtime = createAIRuntime(loadAIRuntimeConfig());
  const languageModels = {
    "agent.chat": runtime.languageModel("agent.chat"),
    "agent.deep_insight": runtime.languageModel("agent.deep_insight"),
  };
  const content = createContentService();
  const actions = createAiActionService();
  const chats = createAiChatService();
  const notes = createNoteService();
  const knowledge = createKnowledgeService();

  const application: ApplicationPort = {
    chats: {
      async prepareTurn(input) {
        return withDomainErrors(async () => {
          const turn = await chats.prepareTurn(actor(input.actor), input);
          return {
            history: turn.history,
            userMessage: messageView(turn.userMessage, "user"),
            ...(turn.cachedAssistant ? { cached: cachedTurn(turn.cachedAssistant) } : {}),
          };
        });
      },
      async completeTurn(input) {
        return withDomainErrors(async () => messageView(await chats.completeTurn(actor(input.actor), {
          chatId: input.chatId,
          clientRequestId: input.clientRequestId,
          content: input.content,
          metadata: { proposals: input.proposals, ...(input.usage ? { usage: input.usage } : {}) },
        }), "assistant"));
      },
    },
    content: {
      async search(agentActor, input) {
        return withDomainErrors(async () => ({
          items: (await content.search(actor(agentActor), input)).map((item) => ({
            resourceUri: item.resourceUri,
            type: item.type,
            id: item.id,
            title: item.title,
            snippet: item.preview,
            updatedAt: item.updatedAt.toISOString(),
            version: item.version,
          })),
        }));
      },
      async read(agentActor, resourceUri, maxChars) {
        return withDomainErrors(async () => {
          const resource = parseResourceUri(resourceUri);
          const item = await content.get(actor(agentActor), resource.type, resource.id);
          return { resourceUri: item.resourceUri, type: item.type, id: item.id, title: item.title, content: item.content.slice(0, maxChars), version: item.version };
        });
      },
    },
    actions: {
      async get(input) {
        return withDomainErrors(async () => actionView(await actions.get(actor(input.actor), input.actionId)));
      },
      async propose(input) {
        return withDomainErrors(async () => actionView(await actions.propose(actor(input.actor), {
          toolName: input.toolName,
          input: asRecord(input.input),
          preview: asRecord(input.preview),
          riskLevel: input.riskLevel === "high" ? "destructive" : "write",
          executionMode: input.clientEffect ? "client" : "server",
          ...(input.clientEffect ? { clientEffect: input.clientEffect } : {}),
          ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
          idempotencyKey: input.idempotencyKey,
        }), input.riskLevel) as AgentActionProposal);
      },
      confirm(input) {
        return confirmAndMaybeExecute({ actions, notes, knowledge }, input.actor, input.actionId, input.executionMode);
      },
      async cancel(input) {
        return withDomainErrors(async () => {
          const result = await actions.cancel(actor(input.actor), { actionId: input.actionId });
          return actionView(result);
        });
      },
      async retry(input) {
        return withDomainErrors(async () => {
          const frozen = await actions.get(actor(input.actor), input.actionId);
          if (input.executionMode !== frozen.executionMode) {
            throw new AgentError("bad_request", "Action execution mode does not match its frozen proposal.");
          }
          const retried = await actions.retry(actor(input.actor), { actionId: input.actionId, executionMode: input.executionMode });
          const mode = retried.executionMode;
          if (mode === "client") return actionView(retried);
          return executeServerAction({ actions, notes, knowledge }, input.actor, retried.id);
        });
      },
      async reportResult(input) {
        return withDomainErrors(async () => {
          const frozen = await actions.get(actor(input.actor), input.actionId);
          if (frozen.executionMode !== "client") {
            throw new AgentError("bad_request", "Only client actions accept a client result.");
          }
          const result = await actions.recordResult(actor(input.actor), {
            actionId: input.actionId,
            executionMode: "client",
            succeeded: input.status === "succeeded",
            ...(input.result === undefined ? {} : { result: input.result }),
            ...(input.error === undefined ? {} : { errorCode: "client_execution_failed", errorMessage: input.error }),
          });
          return actionView(result);
        });
      },
    },
  };
  return { models: { languageModel: (purpose) => languageModels[purpose] }, application };
}

async function confirmAndMaybeExecute(
  services: Services,
  agentActor: AgentActor,
  actionId: string,
  requestedMode: "server" | "client",
): Promise<AgentActionView> {
  return withDomainErrors(async () => {
    const action = await services.actions.get(actor(agentActor), actionId);
    if (action.executionMode !== requestedMode) throw new AgentError("bad_request", "Action execution mode does not match its frozen proposal.");
    const result = await services.actions.confirm(actor(agentActor), { actionId });
    if (requestedMode === "client") return actionView(result);
    return executeServerAction(services, agentActor, actionId);
  });
}

interface Services {
  actions: ReturnType<typeof createAiActionService>;
  notes: ReturnType<typeof createNoteService>;
  knowledge: ReturnType<typeof createKnowledgeService>;
}

async function executeServerAction(services: Services, agentActor: AgentActor, actionId: string): Promise<AgentActionView> {
  const appActor = actor(agentActor);
  const action = await services.actions.get(appActor, actionId);
  await services.actions.startExecution(appActor, { actionId });
  try {
    const input = asRecord(action.input);
    const common = { actionId, idempotencyKey: action.idempotencyKey };
    let result: unknown;
    if (action.toolName === "note_create") {
      result = await services.notes.create(appActor, { ...common, title: stringField(input, "title"), content: optionalString(input, "content") ?? "" });
    } else if (action.toolName === "note_update") {
      result = await services.notes.update(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input), patch: notePatch(input) });
    } else if (action.toolName === "note_move_to_trash") {
      result = await services.notes.moveToTrash(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input) });
    } else if (action.toolName === "note_restore") {
      result = await services.notes.restore(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input) });
    } else if (action.toolName === "note_move") {
      result = await services.knowledge.addNote(appActor, { ...common, noteId: stringField(input, "noteId"), knowledgeBaseId: stringField(input, "knowledgeBaseId"), folderId: nullableString(input, "folderId"), expectedVersion: version(action, input) });
    } else if (action.toolName === "knowledge_base_create") {
      result = await services.knowledge.createBase(appActor, { ...common, name: stringField(input, "name") });
    } else if (action.toolName === "knowledge_base_rename") {
      result = await services.knowledge.renameBase(appActor, { ...common, knowledgeBaseId: stringField(input, "knowledgeBaseId"), name: stringField(input, "name"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    } else if (action.toolName === "knowledge_item_move") {
      result = await services.knowledge.moveItem(appActor, { ...common, itemId: stringField(input, "itemId"), targetFolderId: nullableString(input, "targetFolderId"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    } else if (action.toolName === "knowledge_item_remove") {
      result = await services.knowledge.removeItem(appActor, { ...common, itemId: stringField(input, "itemId"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    } else {
      throw new AgentError("dependency_unavailable", `Server execution is not available for ${action.toolName}.`);
    }
    const completed = await services.actions.recordResult(appActor, { actionId, executionMode: "server", succeeded: true, result });
    return actionView(completed);
  } catch (error) {
    const normalized = normalizeError(error);
    await services.actions.recordResult(appActor, { actionId, executionMode: "server", succeeded: false, errorCode: normalized.code, errorMessage: normalized.message });
    throw normalized;
  }
}

function actor(input: AgentActor): Actor {
  return createActor({ userId: input.userId, source: "internal-agent", clientId: input.clientId, scopes: input.scopes });
}

function actionView(
  action: Awaited<ReturnType<ReturnType<typeof createAiActionService>["get"]>>,
  riskLevel: ProposeActionInput["riskLevel"] = action.riskLevel === "destructive" ? "high" : "medium",
): AgentActionView {
  return {
    id: action.id,
    toolName: action.toolName as WriteToolName,
    preview: action.preview,
    riskLevel,
    status: action.status,
    executionMode: action.executionMode,
    ...(action.clientEffect ? { clientEffect: action.clientEffect as AgentClientEffect } : {}),
    ...(action.result === null ? {} : { result: action.result }),
    ...(action.errorMessage ? { error: { code: action.errorCode ?? "action_failed", message: action.errorMessage, retryable: action.status === "failed" } } : {}),
  };
}

function messageView<Role extends "user" | "assistant">(message: { id: string; content: string; status: string; createdAt: Date }, role: Role) {
  return { id: message.id, role, content: message.content, status: message.status, createdAt: message.createdAt.toISOString() };
}

function cachedTurn(message: { id: string; content: string; status: string; createdAt: Date; metadata: unknown }) {
  const metadata = typeof message.metadata === "object" && message.metadata !== null && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown>
    : {};
  return {
    assistantMessage: messageView(message, "assistant"),
    ...(Array.isArray(metadata.proposals) ? { proposals: metadata.proposals as AgentActionProposal[] } : {}),
    ...(isUsage(metadata.usage) ? { usage: metadata.usage } : {}),
  };
}

function isUsage(value: unknown): value is { inputTokens?: number; outputTokens?: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return (usage.inputTokens === undefined || typeof usage.inputTokens === "number")
    && (usage.outputTokens === undefined || typeof usage.outputTokens === "number");
}

function parseResourceUri(uri: string) {
  const match = /^mewmo:\/\/(notes|clips|feed-entries)\/([^/]+)$/.exec(uri);
  if (!match) throw new AgentError("bad_request", "Invalid Mewmo resource URI.");
  const collection = match[1];
  const id = match[2];
  if (!collection || !id) throw new AgentError("bad_request", "Invalid Mewmo resource URI.");
  return { type: collection === "notes" ? "note" as const : collection === "clips" ? "clip" as const : "feed_entry" as const, id };
}

function version(action: { expectedVersion: number | null }, input: Record<string, unknown>) {
  const value = action.expectedVersion ?? input.expectedVersion;
  if (typeof value !== "number") throw new AgentError("bad_request", "Action requires expectedVersion.");
  return value;
}

function notePatch(input: Record<string, unknown>) {
  const patch = { ...(typeof input.title === "string" ? { title: input.title } : {}), ...(typeof input.content === "string" ? { content: input.content } : {}) };
  if (!Object.keys(patch).length) throw new AgentError("bad_request", "Note update contains no changes.");
  return patch;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AgentError("bad_request", "Expected an object.");
  return value as Record<string, unknown>;
}

function stringField(input: Record<string, unknown>, name: string) { const value = input[name]; if (typeof value !== "string" || !value) throw new AgentError("bad_request", `Missing ${name}.`); return value; }
function optionalString(input: Record<string, unknown>, name: string) { return typeof input[name] === "string" ? input[name] : undefined; }
function nullableString(input: Record<string, unknown>, name: string) { const value = input[name]; return typeof value === "string" ? value : null; }

async function withDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw normalizeError(error); }
}

function normalizeError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof DomainError) {
    const mapped = error.code === "invalid_state" || error.code === "already_exists" ? "conflict" : error.code;
    return new AgentError(mapped, error.message, { cause: error });
  }
  return new AgentError("internal_error", "Agent application operation failed.", { cause: error });
}
