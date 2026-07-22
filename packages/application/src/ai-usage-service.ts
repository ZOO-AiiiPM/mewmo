import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";

export interface RecordAiUsageInput {
  userId: string;
  chatId?: string;
  turnId?: string;
  runId?: string;
  entryId?: string;
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
  productCredits?: number;
  priceSnapshot?: unknown;
  idempotencyKey: string;
}

type UsageWriter = Pick<PrismaClient, "aiUsageEvent"> | Prisma.TransactionClient;

export function createAiUsageService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    record(input: RecordAiUsageInput) {
      return recordAiUsage(db, input);
    },
  };
}

export function recordAiUsage(db: UsageWriter, input: RecordAiUsageInput) {
  return db.aiUsageEvent.upsert({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
    create: {
      userId: input.userId,
      ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
      ...(input.runId === undefined ? {} : { runId: input.runId }),
      ...(input.entryId === undefined ? {} : { entryId: input.entryId }),
      purpose: input.purpose,
      operation: input.operation,
      provider: input.provider,
      requestedModel: input.requestedModel,
      ...(input.responseModel === undefined ? {} : { responseModel: input.responseModel }),
      inputTokens: nonNegativeInteger(input.inputTokens),
      outputTokens: nonNegativeInteger(input.outputTokens),
      ...(input.reasoningTokens === undefined ? {} : { reasoningTokens: nonNegativeInteger(input.reasoningTokens) }),
      cacheReadTokens: nonNegativeInteger(input.cacheReadTokens),
      cacheWriteTokens: nonNegativeInteger(input.cacheWriteTokens),
      ...(input.providerCostUsd === undefined ? {} : { providerCostUsd: finiteNumber(input.providerCostUsd) }),
      ...(input.productCredits === undefined ? {} : { productCredits: finiteNumber(input.productCredits) }),
      ...(input.priceSnapshot === undefined ? {} : { priceSnapshot: jsonValue(input.priceSnapshot) }),
      idempotencyKey: input.idempotencyKey,
    },
    update: {},
  });
}

function nonNegativeInteger(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("AI usage tokens must be non-negative finite numbers");
  return Math.floor(value);
}

function finiteNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("AI usage cost must be finite");
  return value;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
