import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import {
  DomainError,
  createActor,
  createAiActionService,
  createAiSessionService,
  createAiSkillService,
  createContentService,
  createKnowledgeService,
  createNoteService,
  type Actor,
} from "@mewmo/application";
import type { AgentActionProposal, AgentActionView, AgentActor, AgentClientEffect, AgentMessageResponse, WriteToolName } from "./contracts";
import { AgentError } from "./errors";
import type { ApplicationPort, ProposeActionInput, SessionEntryRecord } from "./ports";

export async function loadFoundationAdapters() {
  const ai = createAIRuntime(loadAIRuntimeConfig());
  const sessions = createAiSessionService();
  const skills = createAiSkillService();
  const content = createContentService();
  const actions = createAiActionService();
  const notes = createNoteService();
  const knowledge = createKnowledgeService();

  const application: ApplicationPort = {
    turns: {
      async begin(input) {
        return withDomainErrors(async () => {
          const started = await sessions.beginTurn(actor(input.actor), {
            chatId: input.chatId,
            clientRequestId: input.clientRequestId,
            content: input.content,
            workerId: input.workerId,
            leaseMs: input.leaseMs,
          });
          if (!started.cached) return { turnId: started.turn.id };
          return { turnId: started.turn.id, cached: outputResponse(started.turn.output) };
        });
      },
      async complete(input) {
        return withDomainErrors(async () => {
          const turn = await sessions.getTurn(actor(input.actor), { turnId: input.turnId });
          const [userEntry, assistantEntry] = await Promise.all([
            turn.userEntryId ? sessions.getEntry(actor(input.actor), { chatId: turn.chatId, entryId: turn.userEntryId }) : null,
            sessions.getEntry(actor(input.actor), { chatId: turn.chatId, entryId: input.assistantEntryId }),
          ]);
          if (!userEntry || !assistantEntry) throw new AgentError("internal_error", "Completed Agent turn session entries were not found.");
          const response: AgentMessageResponse = {
            userMessage: messageView(entryRecord(userEntry), "user"),
            assistantMessage: messageView(entryRecord(assistantEntry), "assistant"),
            ...(input.proposals.length ? { proposals: input.proposals } : {}),
            ...(input.citations?.length ? { citations: input.citations } : {}),
            ...usagePatch(entryRecord(assistantEntry)),
          };
          await sessions.completeTurn(actor(input.actor), {
            turnId: input.turnId,
            workerId: input.workerId,
            assistantEntryId: input.assistantEntryId,
            output: { response },
          });
          return response;
        });
      },
      async fail(input) {
        await withDomainErrors(async () => {
          await sessions.failTurn(actor(input.actor), {
            turnId: input.turnId,
            workerId: input.workerId,
            code: input.code,
            message: input.message,
            ...(input.interrupted === undefined ? {} : { interrupted: input.interrupted }),
          });
        });
      },
    },
    sessions: {
      async metadata(input) {
        return withDomainErrors(async () => sessions.getSessionMetadata(actor(input.actor), input.chatId));
      },
      async append(input) {
        return withDomainErrors(async () => entryRecord(await sessions.appendEntry(actor(input.actor), {
          chatId: input.chatId,
          turnId: input.turnId,
          entryId: input.entry.entryId,
          parentId: input.entry.parentId,
          type: input.entry.type,
          timestamp: input.entry.timestamp,
          payload: input.entry.payload,
          ...(input.usage ? { usage: input.usage } : {}),
        })));
      },
      async get(input) {
        return withDomainErrors(async () => {
          const entry = await sessions.getEntry(actor(input.actor), { chatId: input.chatId, entryId: input.entryId });
          return entry ? entryRecord(entry) : undefined;
        });
      },
      async list(input) {
        return withDomainErrors(async () => (await sessions.getEntries(actor(input.actor), input)).map(entryRecord));
      },
    },
    skills: {
      async list(input) {
        return withDomainErrors(async () => (await skills.list(actor(input.actor))).map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
          modelPurpose: skill.modelPurpose === "agent.deep_insight" ? "agent.deep_insight" as const : "agent.chat" as const,
          allowedTools: Array.isArray(skill.allowedTools) ? skill.allowedTools.filter((name): name is string => typeof name === "string") : [],
        })));
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
          chatId: input.chatId,
          turnId: input.turnId,
          toolCallId: input.toolCallId,
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
        return withDomainErrors(async () => actionView(await actions.cancel(actor(input.actor), { actionId: input.actionId })));
      },
      async retry(input) {
        return withDomainErrors(async () => {
          const frozen = await actions.get(actor(input.actor), input.actionId);
          if (input.executionMode !== frozen.executionMode) throw new AgentError("bad_request", "Action execution mode does not match its frozen proposal.");
          const retried = await actions.retry(actor(input.actor), { actionId: input.actionId, executionMode: input.executionMode });
          return retried.executionMode === "client" ? actionView(retried) : executeServerAction({ actions, notes, knowledge }, input.actor, retried.id);
        });
      },
      async reportResult(input) {
        return withDomainErrors(async () => {
          const frozen = await actions.get(actor(input.actor), input.actionId);
          if (frozen.executionMode !== "client") throw new AgentError("bad_request", "Only client actions accept a client result.");
          return actionView(await actions.recordResult(actor(input.actor), {
            actionId: input.actionId,
            executionMode: "client",
            succeeded: input.status === "succeeded",
            ...(input.result === undefined ? {} : { result: input.result }),
            ...(input.error === undefined ? {} : { errorCode: "client_execution_failed", errorMessage: input.error }),
          }));
        });
      },
    },
  };
  return { ai, application };
}

function outputResponse(value: unknown): AgentMessageResponse {
  if (!isRecord(value) || !isRecord(value.response)) throw new AgentError("internal_error", "Cached Agent turn output is invalid.");
  return value.response as unknown as AgentMessageResponse;
}

function messageView<Role extends "user" | "assistant">(entry: SessionEntryRecord, role: Role) {
  const message = piMessage(entry);
  return { id: entry.entryId, role, content: messageText(message.content), status: "completed", createdAt: entry.timestamp };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is Record<string, unknown> => isRecord(part))
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function assistantUsage(entry: SessionEntryRecord) {
  const message = piMessage(entry);
  if (message.role !== "assistant" || !isRecord(message.usage)) return undefined;
  const usage = message.usage as Record<string, unknown>;
  return {
    inputTokens: number(usage.input),
    outputTokens: number(usage.output),
    cacheReadTokens: number(usage.cacheRead),
    cacheWriteTokens: number(usage.cacheWrite),
    ...(typeof usage.reasoning === "number" ? { reasoningTokens: usage.reasoning } : {}),
    ...(isRecord(usage.cost) && typeof usage.cost.total === "number" ? { providerCostUsd: usage.cost.total } : {}),
  };
}

function usagePatch(entry: SessionEntryRecord): Pick<AgentMessageResponse, "usage"> | Record<string, never> {
  const usage = assistantUsage(entry);
  return usage ? { usage } : {};
}

function piMessage(entry: SessionEntryRecord): Record<string, unknown> {
  if (entry.type !== "message" || !isRecord(entry.payload) || !isRecord(entry.payload.message)) throw new AgentError("internal_error", "Session message entry is invalid.");
  return entry.payload.message;
}

function entryRecord(entry: { entryId: string; entrySeq: number; parentId: string | null; type: string; payload: unknown; timestamp: Date }) {
  return { entryId: entry.entryId, entrySeq: entry.entrySeq, parentId: entry.parentId, type: entry.type, payload: entry.payload, timestamp: entry.timestamp.toISOString() };
}

async function confirmAndMaybeExecute(services: Services, agentActor: AgentActor, actionId: string, requestedMode: "server" | "client") {
  return withDomainErrors(async () => {
    const action = await services.actions.get(actor(agentActor), actionId);
    if (action.executionMode !== requestedMode) throw new AgentError("bad_request", "Action execution mode does not match its frozen proposal.");
    const result = await services.actions.confirm(actor(agentActor), { actionId });
    return requestedMode === "client" ? actionView(result) : executeServerAction(services, agentActor, actionId);
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
    if (action.toolName === "note_create") result = await services.notes.create(appActor, { ...common, title: stringField(input, "title"), content: optionalString(input, "content") ?? "" });
    else if (action.toolName === "note_update") result = await services.notes.update(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input), patch: notePatch(input) });
    else if (action.toolName === "note_move_to_trash") result = await services.notes.moveToTrash(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input) });
    else if (action.toolName === "note_restore") result = await services.notes.restore(appActor, { ...common, noteId: stringField(input, "noteId"), expectedVersion: version(action, input) });
    else if (action.toolName === "note_move") result = await services.knowledge.addNote(appActor, { ...common, noteId: stringField(input, "noteId"), knowledgeBaseId: stringField(input, "knowledgeBaseId"), folderId: nullableString(input, "folderId"), expectedVersion: version(action, input) });
    else if (action.toolName === "knowledge_base_create") result = await services.knowledge.createBase(appActor, { ...common, name: stringField(input, "name") });
    else if (action.toolName === "knowledge_base_rename") result = await services.knowledge.renameBase(appActor, { ...common, knowledgeBaseId: stringField(input, "knowledgeBaseId"), name: stringField(input, "name"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    else if (action.toolName === "knowledge_item_move") result = await services.knowledge.moveItem(appActor, { ...common, itemId: stringField(input, "itemId"), targetFolderId: nullableString(input, "targetFolderId"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    else if (action.toolName === "knowledge_item_remove") result = await services.knowledge.removeItem(appActor, { ...common, itemId: stringField(input, "itemId"), ...(action.expectedVersion === null ? {} : { expectedVersion: action.expectedVersion }) });
    else throw new AgentError("dependency_unavailable", `Server execution is not available for ${action.toolName}.`);
    return actionView(await services.actions.recordResult(appActor, { actionId, executionMode: "server", succeeded: true, result }));
  } catch (error) {
    const normalized = normalizeError(error);
    await services.actions.recordResult(appActor, { actionId, executionMode: "server", succeeded: false, errorCode: normalized.code, errorMessage: normalized.message });
    throw normalized;
  }
}

function actor(input: AgentActor): Actor {
  return createActor({ userId: input.userId, source: "internal-agent", clientId: input.clientId, scopes: input.scopes });
}

function actionView(action: Awaited<ReturnType<ReturnType<typeof createAiActionService>["get"]>>, riskLevel: ProposeActionInput["riskLevel"] = action.riskLevel === "destructive" ? "high" : "medium"): AgentActionView {
  return { id: action.id, toolName: action.toolName as WriteToolName, preview: action.preview, riskLevel, status: action.status, executionMode: action.executionMode, ...(action.clientEffect ? { clientEffect: action.clientEffect as AgentClientEffect } : {}), ...(action.result === null ? {} : { result: action.result }), ...(action.errorMessage ? { error: { code: action.errorCode ?? "action_failed", message: action.errorMessage, retryable: action.status === "failed" } } : {}) };
}

function parseResourceUri(uri: string) { const match = /^mewmo:\/\/(notes|clips|feed-entries)\/([^/]+)$/.exec(uri); if (!match?.[1] || !match[2]) throw new AgentError("bad_request", "Invalid Mewmo resource URI."); return { type: match[1] === "notes" ? "note" as const : match[1] === "clips" ? "clip" as const : "feed_entry" as const, id: match[2] }; }
function version(action: { expectedVersion: number | null }, input: Record<string, unknown>) { const value = action.expectedVersion ?? input.expectedVersion; if (typeof value !== "number") throw new AgentError("bad_request", "Action requires expectedVersion."); return value; }
function notePatch(input: Record<string, unknown>) { const patch = { ...(typeof input.title === "string" ? { title: input.title } : {}), ...(typeof input.content === "string" ? { content: input.content } : {}) }; if (!Object.keys(patch).length) throw new AgentError("bad_request", "Note update contains no changes."); return patch; }
function asRecord(value: unknown): Record<string, unknown> { if (!isRecord(value) || Array.isArray(value)) throw new AgentError("bad_request", "Expected an object."); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringField(input: Record<string, unknown>, name: string) { const value = input[name]; if (typeof value !== "string" || !value) throw new AgentError("bad_request", `Missing ${name}.`); return value; }
function optionalString(input: Record<string, unknown>, name: string) { return typeof input[name] === "string" ? input[name] : undefined; }
function nullableString(input: Record<string, unknown>, name: string) { const value = input[name]; return typeof value === "string" ? value : null; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
async function withDomainErrors<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (error) { throw normalizeError(error); } }
function normalizeError(error: unknown): AgentError { if (error instanceof AgentError) return error; if (error instanceof DomainError) { const mapped = error.code === "invalid_state" || error.code === "already_exists" ? "conflict" : error.code; return new AgentError(mapped, error.message, { cause: error }); } return new AgentError("internal_error", "Agent application operation failed.", { cause: error }); }
