import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";

import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export interface AiSkillCommand {
  name: string;
  description: string;
  content: string;
  modelPurpose?: "agent.chat" | "agent.deep_insight";
  allowedTools: string[];
  enabled?: boolean;
}

export function createAiSkillService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async list(actor: Actor) {
      assertScope(actor.scopes, "content:read");
      return db.aiSkill.findMany({ where: { userId: actor.userId, enabled: true }, orderBy: { updatedAt: "desc" } });
    },

    async create(actor: Actor, command: AiSkillCommand) {
      assertScope(actor.scopes, "content:write");
      const input = normalize(command);
      return db.aiSkill.create({
        data: {
          userId: actor.userId,
          ...input,
          allowedTools: input.allowedTools as Prisma.InputJsonValue,
        },
      });
    },

    async update(actor: Actor, input: { skillId: string; expectedVersion: number; patch: Partial<AiSkillCommand> }) {
      assertScope(actor.scopes, "content:write");
      const current = await db.aiSkill.findFirst({ where: { id: input.skillId, userId: actor.userId } });
      if (!current) throw new DomainError("not_found", "AI skill was not found");
      const existingTools = Array.isArray(current.allowedTools) ? current.allowedTools.filter((item): item is string => typeof item === "string") : [];
      const normalized = normalize({
        name: input.patch.name ?? current.name,
        description: input.patch.description ?? current.description,
        content: input.patch.content ?? current.content,
        modelPurpose: input.patch.modelPurpose ?? asModelPurpose(current.modelPurpose),
        allowedTools: input.patch.allowedTools ?? existingTools,
        enabled: input.patch.enabled ?? current.enabled,
      });
      const updated = await db.aiSkill.updateMany({
        where: { id: current.id, userId: actor.userId, version: input.expectedVersion },
        data: { ...normalized, allowedTools: normalized.allowedTools as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError("conflict", "AI skill changed before this update");
      return db.aiSkill.findUniqueOrThrow({ where: { id: current.id } });
    },

    async remove(actor: Actor, input: { skillId: string; expectedVersion: number }) {
      assertScope(actor.scopes, "content:write");
      const removed = await db.aiSkill.deleteMany({ where: { id: input.skillId, userId: actor.userId, version: input.expectedVersion } });
      if (removed.count !== 1) throw new DomainError("conflict", "AI skill was missing or changed before deletion");
      return { id: input.skillId };
    },
  };
}

function normalize(command: AiSkillCommand) {
  const name = command.name.trim();
  const description = command.description.trim();
  const content = command.content.trim();
  const allowedTools = [...new Set(command.allowedTools.map((tool) => tool.trim()).filter(Boolean))];
  if (!name || name.length > 100) throw new DomainError("invalid_state", "AI skill name is invalid");
  if (!description || description.length > 500) throw new DomainError("invalid_state", "AI skill description is invalid");
  if (!content || content.length > 100_000) throw new DomainError("invalid_state", "AI skill content is invalid");
  return {
    name,
    description,
    content,
    modelPurpose: command.modelPurpose ?? "agent.chat",
    allowedTools,
    enabled: command.enabled ?? true,
  };
}

function asModelPurpose(value: string): "agent.chat" | "agent.deep_insight" {
  return value === "agent.deep_insight" ? value : "agent.chat";
}
