import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import {
  agentConversationEventSchema,
  type AgentConversationEvent,
} from "@mewmo/shared";
import { ZodError } from "zod";

import type { AgentConfig } from "./config";
import {
  actionResultBodySchema,
  confirmActionBodySchema,
  sendMessageBodySchema,
  type AgentActionProposal,
  type AgentActionView,
  type AgentMessageResponse,
} from "./contracts";
import { AgentError, errorBody, toAgentError } from "./errors";
import { verifyIdentity } from "./identity";
import type { AgentRuntimeEvent, AgentRuntimePort, ApplicationPort } from "./ports";

export interface AgentServerDependencies {
  config: AgentConfig;
  runtime: AgentRuntimePort;
  application: ApplicationPort;
}

export function buildAgentServer(dependencies: AgentServerDependencies): FastifyInstance {
  const app = Fastify({ logger: false, requestIdHeader: "x-request-id" });
  app.get("/health", async () => ({ ok: true }));

  app.addHook("preHandler", async (request) => {
    if (request.routeOptions.url === "/health") return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new AgentError("unauthorized", "Missing Agent identity.");
    request.agentActor = await verifyIdentity(authorization.slice(7), {
      secret: dependencies.config.AGENT_IDENTITY_SECRET,
      issuer: dependencies.config.AGENT_IDENTITY_ISSUER,
      audience: dependencies.config.AGENT_IDENTITY_AUDIENCE,
    });
  });

  app.post<{ Params: { chatId: string } }>("/v1/chats/:chatId/messages", async (request) => {
    const body = sendMessageBodySchema.parse(request.body);
    const workerId = `${dependencies.config.AGENT_WORKER_ID}:${randomUUID()}`;
    const started = await dependencies.application.turns.begin({
      actor: request.agentActor,
      chatId: request.params.chatId,
      clientRequestId: body.clientRequestId,
      content: body.content,
      workerId,
      leaseMs: dependencies.config.AGENT_TURN_LEASE_MS,
    });
    if (started.cached) return started.cached;
    try {
      const result = await dependencies.runtime.run({ actor: request.agentActor, chatId: request.params.chatId, turnId: started.turnId, workerId, request: body });
      return dependencies.application.turns.complete({ actor: request.agentActor, turnId: started.turnId, workerId, assistantEntryId: result.assistantEntryId, proposals: result.proposals, citations: result.citations });
    } catch (error) {
      const normalized = toAgentError(error);
      await dependencies.application.turns.fail({ actor: request.agentActor, turnId: started.turnId, workerId, code: normalized.code, message: normalized.message, interrupted: isInterrupted(error) });
      throw normalized;
    }
  });

  app.post<{ Params: { chatId: string } }>("/v1/chats/:chatId/stream", async (request, reply) => {
    const body = sendMessageBodySchema.parse(request.body);
    const workerId = `${dependencies.config.AGENT_WORKER_ID}:${randomUUID()}`;
    const started = await dependencies.application.turns.begin({ actor: request.agentActor, chatId: request.params.chatId, clientRequestId: body.clientRequestId, content: body.content, workerId, leaseMs: dependencies.config.AGENT_TURN_LEASE_MS });
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const conversation = createConversationEmitter(send, request.params.chatId, started.turnId);
    conversation.emit({ type: "turn.started" });
    if (started.cached) {
      emitCompletedTurn(conversation, started.cached);
      send("result", started.cached);
      reply.raw.end();
      return;
    }
    try {
      const result = await dependencies.runtime.run(
        { actor: request.agentActor, chatId: request.params.chatId, turnId: started.turnId, workerId, request: body },
        (event) => streamRuntimeEvent(send, conversation, event),
      );
      const response = await dependencies.application.turns.complete({ actor: request.agentActor, turnId: started.turnId, workerId, assistantEntryId: result.assistantEntryId, proposals: result.proposals, citations: result.citations });
      emitCompletedTurn(conversation, response);
      send("result", response);
    } catch (error) {
      const normalized = toAgentError(error);
      await dependencies.application.turns.fail({ actor: request.agentActor, turnId: started.turnId, workerId, code: normalized.code, message: normalized.message, interrupted: isInterrupted(error) });
      conversation.emit({
        type: "turn.failed",
        error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable },
        retryable: normalized.retryable,
      });
      send("error", errorBody(normalized, request.id));
    } finally {
      reply.raw.end();
    }
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/confirm", async (request) => {
    const action = await dependencies.application.actions.confirm({ actor: request.agentActor, actionId: request.params.id, executionMode: confirmActionBodySchema.parse(request.body).executionMode });
    return { action, ...(action.status === "succeeded" ? { resultMessage: actionResultMessage(action) } : {}) };
  });
  app.get<{ Params: { id: string } }>("/v1/actions/:id", async (request) => ({ action: await dependencies.application.actions.get({ actor: request.agentActor, actionId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/v1/actions/:id/cancel", async (request) => ({ action: await dependencies.application.actions.cancel({ actor: request.agentActor, actionId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/v1/actions/:id/retry", async (request) => {
    const action = await dependencies.application.actions.retry({ actor: request.agentActor, actionId: request.params.id, executionMode: confirmActionBodySchema.parse(request.body).executionMode });
    return { action, ...(action.status === "succeeded" ? { resultMessage: actionResultMessage(action) } : {}) };
  });
  app.post<{ Params: { id: string } }>("/v1/actions/:id/result", async (request) => ({ action: await dependencies.application.actions.reportResult({ actor: request.agentActor, actionId: request.params.id, ...actionResultBodySchema.parse(request.body) }) }));

  app.setErrorHandler((unknownError, request, reply) => {
    const error = unknownError instanceof ZodError ? new AgentError("bad_request", "Invalid request body.", { cause: unknownError }) : toAgentError(unknownError);
    void reply.status(error.statusCode).send(errorBody(error, request.id));
  });
  return app;
}

type ConversationEventPayload = AgentConversationEvent extends infer Event
  ? Event extends AgentConversationEvent
    ? Omit<Event, "chatId" | "turnId" | "seq">
    : never
  : never;

interface ConversationEmitter {
  emit(event: ConversationEventPayload): AgentConversationEvent;
}

function createConversationEmitter(
  send: (event: string, data: unknown) => void,
  chatId: string,
  turnId: string,
): ConversationEmitter {
  let seq = 0;
  return {
    emit(payload) {
      const event = agentConversationEventSchema.parse({ ...payload, chatId, turnId, seq: ++seq });
      send(event.type, event);
      return event;
    },
  };
}

function streamRuntimeEvent(
  send: (event: string, data: unknown) => void,
  conversation: ConversationEmitter,
  event: AgentRuntimeEvent,
) {
  if (event.type === "text_delta") {
    conversation.emit({ type: "assistant.text.delta", delta: event.delta });
    // ZOO-74 removes these legacy events after the Web consumes the stable contract.
    send(event.type, event);
    return;
  }
  if (event.type === "tool_start") {
    conversation.emit({
      type: "tool.started",
      toolCallId: event.toolCallId,
      tool: event.toolName,
      display: { label: toolLabel(event.toolName, "started") },
    });
    send(event.type, event);
    return;
  }
  if (event.type === "tool_end") {
    conversation.emit({
      type: "tool.completed",
      toolCallId: event.toolCallId,
      display: { label: toolLabel(event.toolName, event.isError ? "failed" : "completed") },
    });
    send(event.type, event);
  }
}

function emitCompletedTurn(conversation: ConversationEmitter, response: AgentMessageResponse) {
  for (const proposal of response.proposals ?? []) {
    conversation.emit({
      type: "confirmation.required",
      actionId: proposal.id,
      display: proposalDisplay(proposal),
    });
  }
  conversation.emit({
    type: "turn.completed",
    message: response.assistantMessage,
    ...(response.usage ? { usage: response.usage } : {}),
  });
}

function proposalDisplay(proposal: AgentActionProposal) {
  const preview = isRecord(proposal.preview) ? proposal.preview : {};
  const title = typeof preview.title === "string" && preview.title.trim()
    ? preview.title.trim()
    : actionTitles[proposal.toolName] ?? "确认执行此操作";
  return {
    title,
    ...(typeof preview.summary === "string" && preview.summary.trim()
      ? { summary: preview.summary.trim() }
      : {}),
    riskLevel: proposal.riskLevel,
  };
}

const toolLabels: Partial<Record<string, string>> = {
  content_search: "正在搜索知识库",
  content_read: "正在读取内容",
  read_current_context: "正在读取当前内容",
  web_search: "正在搜索网页",
  web_fetch: "正在读取网页",
};

const actionTitles: Partial<Record<string, string>> = {
  note_create: "确认创建笔记",
  note_update: "确认更新笔记",
  note_move: "确认移动笔记",
  note_move_to_trash: "确认移入废纸篓",
  note_restore: "确认恢复笔记",
  knowledge_base_create: "确认创建知识库",
  knowledge_base_rename: "确认重命名知识库",
  knowledge_item_move: "确认移动知识条目",
  knowledge_item_remove: "确认移除知识条目",
};

const actionCompletedLabels: Record<string, string> = {
  note_create: "已创建笔记",
  note_update: "已更新笔记",
  note_move: "已移动笔记",
  note_move_to_trash: "已移入废纸篓",
  note_restore: "已恢复笔记",
  knowledge_base_create: "已创建知识库",
  knowledge_base_rename: "已重命名知识库",
  knowledge_item_move: "已移动知识条目",
  knowledge_item_remove: "已移除知识条目",
};

/**
 * Generates a brief confirmation message summarizing the completed action.
 * This allows the frontend to show an immediate result confirmation in the
 * conversation after a server-side action executes successfully.
 */
export function actionResultMessage(action: AgentActionView): string {
  const label = actionCompletedLabels[action.toolName] ?? "操作已完成";
  const preview = isRecord(action.preview) ? action.preview : {};
  const title = typeof preview.title === "string" && preview.title.trim() ? preview.title.trim() : "";
  const summary = typeof preview.summary === "string" && preview.summary.trim() ? preview.summary.trim() : "";
  const parts = [label];
  if (title) parts.push(`「${title}」`);
  if (summary) parts.push(`— ${summary}`);
  return parts.join("");
}

function toolLabel(toolName: string, state: "started" | "completed" | "failed") {
  const active = toolLabels[toolName] ?? "正在处理请求";
  if (state === "started") return active;
  const action = active.replace(/^正在/, "");
  return state === "completed" ? `已${action}` : `${action}失败`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInterrupted(error: unknown) { return error instanceof Error && error.name === "AbortError"; }

declare module "fastify" {
  interface FastifyRequest { agentActor: import("./contracts").AgentActor; }
}
