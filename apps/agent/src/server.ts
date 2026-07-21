import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { AgentConfig } from "./config";
import {
  actionResultBodySchema,
  confirmActionBodySchema,
  sendMessageBodySchema,
  type AgentMessageResponse,
} from "./contracts";
import { AgentError, errorBody, toAgentError } from "./errors";
import { verifyIdentity } from "./identity";
import type { AgentRuntimePort, ApplicationPort } from "./ports";

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
    const turn = await dependencies.application.chats.prepareTurn({
      actor: request.agentActor,
      chatId: request.params.chatId,
      clientRequestId: body.clientRequestId,
      content: body.content,
    });
    if (turn.cached) {
      return { userMessage: turn.userMessage, ...turn.cached } satisfies AgentMessageResponse;
    }
    const result = await dependencies.runtime.run({ actor: request.agentActor, chatId: request.params.chatId, history: turn.history, request: body });
    const assistantMessage = await dependencies.application.chats.completeTurn({
      actor: request.agentActor,
      chatId: request.params.chatId,
      clientRequestId: body.clientRequestId,
      content: result.text,
      proposals: result.proposals,
      ...(result.usage ? { usage: result.usage } : {}),
    });
    return {
      userMessage: turn.userMessage,
      assistantMessage,
      ...(result.proposals.length > 0 ? { proposals: result.proposals } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
    } satisfies AgentMessageResponse;
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/confirm", async (request) => {
    const body = confirmActionBodySchema.parse(request.body);
    const action = await dependencies.application.actions.confirm({ actor: request.agentActor, actionId: request.params.id, executionMode: body.executionMode });
    return { action };
  });

  app.get<{ Params: { id: string } }>("/v1/actions/:id", async (request) => {
    return { action: await dependencies.application.actions.get({ actor: request.agentActor, actionId: request.params.id }) };
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/cancel", async (request) => {
    return { action: await dependencies.application.actions.cancel({ actor: request.agentActor, actionId: request.params.id }) };
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/retry", async (request) => {
    const body = confirmActionBodySchema.parse(request.body);
    return { action: await dependencies.application.actions.retry({ actor: request.agentActor, actionId: request.params.id, executionMode: body.executionMode }) };
  });

  app.post<{ Params: { id: string } }>("/v1/actions/:id/result", async (request) => {
    const body = actionResultBodySchema.parse(request.body);
    return { action: await dependencies.application.actions.reportResult({ actor: request.agentActor, actionId: request.params.id, ...body }) };
  });

  app.setErrorHandler((unknownError, request, reply) => {
    const error = unknownError instanceof ZodError ? new AgentError("bad_request", "Invalid request body.", { cause: unknownError }) : toAgentError(unknownError);
    void reply.status(error.statusCode).send(errorBody(error, request.id));
  });

  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    agentActor: import("./contracts").AgentActor;
  }
}
