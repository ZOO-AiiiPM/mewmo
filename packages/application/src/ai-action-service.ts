import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";
import { proposeAiActionSchema, type ProposeAiActionDto } from "@mewmo/shared";
import type { Actor } from "./actor";
import { DomainError } from "./errors";

interface ActionIdentity {
  actionId: string;
}

export function createAiActionService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();

  async function owned(actor: Actor, actionId: string) {
    const action = await db.aiAction.findFirst({ where: { id: actionId, userId: actor.userId } });
    if (!action) throw new DomainError("not_found", "AI action was not found");
    return action;
  }

  return {
    async propose(actor: Actor, command: Omit<ProposeAiActionDto, "userId">) {
      const input = proposeAiActionSchema.parse({ ...command, userId: actor.userId });
      return db.aiAction.upsert({
        where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey: input.idempotencyKey } },
        create: {
          userId: actor.userId,
          toolName: input.toolName,
          input: input.input as Prisma.InputJsonValue,
          preview: input.preview as Prisma.InputJsonValue,
          riskLevel: input.riskLevel,
          executionMode: input.executionMode,
          ...(input.clientEffect === undefined ? {} : { clientEffect: input.clientEffect as Prisma.InputJsonValue }),
          ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
          idempotencyKey: input.idempotencyKey,
        },
        update: {},
      });
    },

    get(actor: Actor, actionId: string) {
      return owned(actor, actionId);
    },

    async confirm(actor: Actor, { actionId }: ActionIdentity) {
      await owned(actor, actionId);
      const result = await db.aiAction.updateMany({
        where: { id: actionId, userId: actor.userId, status: "proposed" },
        data: { status: "confirmed", confirmedAt: new Date() },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "only proposed actions can be confirmed");
      return owned(actor, actionId);
    },

    async startExecution(actor: Actor, { actionId }: ActionIdentity) {
      await owned(actor, actionId);
      const result = await db.aiAction.updateMany({
        where: { id: actionId, userId: actor.userId, status: "confirmed" },
        data: { status: "executing", executionStartedAt: new Date() },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "only confirmed actions can start execution");
      return owned(actor, actionId);
    },

    async recordResult(actor: Actor, input: ActionIdentity & { succeeded: boolean; result?: unknown; errorCode?: string; errorMessage?: string }) {
      const action = await owned(actor, input.actionId);
      if (action.status !== "confirmed" && action.status !== "executing") {
        if (action.status === "succeeded" || action.status === "failed") return action;
        throw new DomainError("invalid_state", "action is not ready to record a result");
      }
      await db.aiAction.update({
        where: { id: input.actionId },
        data: {
          status: input.succeeded ? "succeeded" : "failed",
          completedAt: new Date(),
          ...(input.result === undefined ? {} : { result: input.result as never }),
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
        },
      });
      return owned(actor, input.actionId);
    },

    async cancel(actor: Actor, { actionId }: ActionIdentity) {
      await owned(actor, actionId);
      const result = await db.aiAction.updateMany({
        where: { id: actionId, userId: actor.userId, status: { in: ["proposed", "confirmed"] } },
        data: { status: "cancelled", completedAt: new Date() },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "action can no longer be cancelled");
      return owned(actor, actionId);
    },

    async retry(actor: Actor, { actionId }: ActionIdentity) {
      await owned(actor, actionId);
      const result = await db.aiAction.updateMany({
        where: { id: actionId, userId: actor.userId, status: "failed" },
        data: {
          status: "confirmed",
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          executionStartedAt: null,
        },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "only failed actions can be retried");
      return owned(actor, actionId);
    },
  };
}
