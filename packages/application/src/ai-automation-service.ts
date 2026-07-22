import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";
import { CronExpressionParser } from "cron-parser";

import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export interface AiAutomationCommand {
  name: string;
  prompt: string;
  skillName?: string;
  cronExpression: string;
  timezone: string;
  enabled?: boolean;
}

export function createAiAutomationService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async list(actor: Actor) {
      assertScope(actor.scopes, "content:read");
      return db.aiAutomation.findMany({ where: { userId: actor.userId }, orderBy: { updatedAt: "desc" } });
    },

    async create(actor: Actor, command: AiAutomationCommand, now = new Date()) {
      assertScope(actor.scopes, "content:write");
      const input = normalize(command, now);
      return db.$transaction(async (tx) => {
        const chat = await tx.aiChat.create({ data: { userId: actor.userId, title: input.name } });
        return tx.aiAutomation.create({ data: { userId: actor.userId, chatId: chat.id, ...input } });
      });
    },

    async update(actor: Actor, input: { automationId: string; expectedVersion: number; patch: Partial<AiAutomationCommand>; now?: Date }) {
      assertScope(actor.scopes, "content:write");
      const current = await db.aiAutomation.findFirst({ where: { id: input.automationId, userId: actor.userId } });
      if (!current) throw new DomainError("not_found", "AI automation was not found");
      const skillName = input.patch.skillName ?? current.skillName;
      const normalized = normalize({
        name: input.patch.name ?? current.name,
        prompt: input.patch.prompt ?? current.prompt,
        ...(skillName ? { skillName } : {}),
        cronExpression: input.patch.cronExpression ?? current.cronExpression,
        timezone: input.patch.timezone ?? current.timezone,
        enabled: input.patch.enabled ?? current.enabled,
      }, input.now ?? new Date());
      const result = await db.aiAutomation.updateMany({
        where: { id: current.id, userId: actor.userId, version: input.expectedVersion },
        data: { ...normalized, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new DomainError("conflict", "AI automation changed before this update");
      return db.aiAutomation.findUniqueOrThrow({ where: { id: current.id } });
    },

    async remove(actor: Actor, input: { automationId: string; expectedVersion: number }) {
      assertScope(actor.scopes, "content:write");
      const automation = await db.aiAutomation.findFirst({ where: { id: input.automationId, userId: actor.userId } });
      if (!automation) throw new DomainError("not_found", "AI automation was not found");
      return db.$transaction(async (tx) => {
        const deleted = await tx.aiAutomation.deleteMany({ where: { id: automation.id, userId: actor.userId, version: input.expectedVersion } });
        if (deleted.count !== 1) throw new DomainError("conflict", "AI automation changed before deletion");
        await tx.aiChat.updateMany({ where: { id: automation.chatId, userId: actor.userId }, data: { deletedAt: new Date(), version: { increment: 1 } } });
        return { id: automation.id };
      });
    },

    async enqueueDue(input: { now?: Date; limit?: number }) {
      const now = input.now ?? new Date();
      const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
      return db.$transaction(async (tx) => {
        const due = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id
          FROM ai_automations
          WHERE enabled = true AND next_run_at <= ${now}
          ORDER BY next_run_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        `);
        const runs = [];
        for (const item of due) {
          const automation = await tx.aiAutomation.findUnique({ where: { id: item.id } });
          if (!automation || !automation.enabled) continue;
          const scheduledFor = automation.nextRunAt;
          const idempotencyKey = `agent_automation:${automation.id}:${scheduledFor.toISOString()}`;
          const run = await tx.aiRun.upsert({
            where: { userId_idempotencyKey: { userId: automation.userId, idempotencyKey } },
            create: {
              userId: automation.userId,
              kind: "agent_automation",
              targetType: "automation",
              targetId: automation.id,
              automationId: automation.id,
              inputVersion: automation.version,
              idempotencyKey,
              priority: 0,
              availableAt: scheduledFor,
            },
            update: {},
          });
          await tx.aiAutomation.update({
            where: { id: automation.id },
            data: { lastEnqueuedAt: scheduledFor, nextRunAt: nextOccurrence(automation.cronExpression, automation.timezone, now) },
          });
          runs.push(run);
        }
        return runs;
      });
    },
  };
}

function normalize(command: AiAutomationCommand, now: Date) {
  const name = command.name.trim();
  const prompt = command.prompt.trim();
  const cronExpression = command.cronExpression.trim();
  const timezone = command.timezone.trim();
  if (!name || name.length > 200) throw new DomainError("invalid_state", "AI automation name is invalid");
  if (!prompt || prompt.length > 20_000) throw new DomainError("invalid_state", "AI automation prompt is invalid");
  if (!timezone) throw new DomainError("invalid_state", "AI automation timezone is required");
  const nextRunAt = nextOccurrence(cronExpression, timezone, now);
  return {
    name,
    prompt,
    ...(command.skillName?.trim() ? { skillName: command.skillName.trim() } : {}),
    cronExpression,
    timezone,
    enabled: command.enabled ?? true,
    nextRunAt,
  };
}

function nextOccurrence(expression: string, timezone: string, currentDate: Date) {
  try {
    return CronExpressionParser.parse(expression, { currentDate, tz: timezone }).next().toDate();
  } catch (error) {
    throw new DomainError("invalid_state", "AI automation cron expression or timezone is invalid", {
      reason: error instanceof Error ? error.message : "unknown cron error",
    });
  }
}
