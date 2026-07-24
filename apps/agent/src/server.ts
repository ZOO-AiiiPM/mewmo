import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { AgentConfig } from "./config";
import { actionResultBodySchema, confirmActionBodySchema, sendMessageBodySchema } from "./contracts";
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
      await dependencies.application.turns.fail({ actor: request.agentActor, turnId: started.turnId, workerId, code: errorCode(error), message: errorMessage(error), interrupted: isInterrupted(error) });
      throw error;
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
    if (started.cached) {
      send("result", started.cached);
      reply.raw.end();
      return;
    }
    try {
      const result = await dependencies.runtime.run({ actor: request.agentActor, chatId: request.params.chatId, turnId: started.turnId, workerId, request: body }, (event) => streamEvent(send, event));
      const response = await dependencies.application.turns.complete({ actor: request.agentActor, turnId: started.turnId, workerId, assistantEntryId: result.assistantEntryId, proposals: result.proposals, citations: result.citations });
      send("result", response);
    } catch (error) {
      await dependencies.application.turns.fail({ actor: request.agentActor, turnId: started.turnId, workerId, code: errorCode(error), message: errorMessage(error), interrupted: isInterrupted(error) });
      send("error", errorBody(toAgentError(error), request.id));
    } finally {
      reply.raw.end();
    }
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/confirm", async (request) => ({ action: await dependencies.application.actions.confirm({ actor: request.agentActor, actionId: request.params.id, executionMode: confirmActionBodySchema.parse(request.body).executionMode }) }));
  app.get<{ Params: { id: string } }>("/v1/actions/:id", async (request) => ({ action: await dependencies.application.actions.get({ actor: request.agentActor, actionId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/v1/actions/:id/cancel", async (request) => ({ action: await dependencies.application.actions.cancel({ actor: request.agentActor, actionId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/v1/actions/:id/retry", async (request) => ({ action: await dependencies.application.actions.retry({ actor: request.agentActor, actionId: request.params.id, executionMode: confirmActionBodySchema.parse(request.body).executionMode }) }));
  app.post<{ Params: { id: string } }>("/v1/actions/:id/result", async (request) => ({ action: await dependencies.application.actions.reportResult({ actor: request.agentActor, actionId: request.params.id, ...actionResultBodySchema.parse(request.body) }) }));

  app.setErrorHandler((unknownError, request, reply) => {
    const error = unknownError instanceof ZodError ? new AgentError("bad_request", "Invalid request body.", { cause: unknownError }) : toAgentError(unknownError);
    void reply.status(error.statusCode).send(errorBody(error, request.id));
  });
  return app;
}

function streamEvent(send: (event: string, data: unknown) => void, event: AgentRuntimeEvent) {
  send(event.type, event);
}

function errorCode(error: unknown) { return error instanceof AgentError ? error.code : "agent_failed"; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Agent turn failed"; }
function isInterrupted(error: unknown) { return error instanceof Error && error.name === "AbortError"; }

declare module "fastify" {
  interface FastifyRequest { agentActor: import("./contracts").AgentActor; }
}
