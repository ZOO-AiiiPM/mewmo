export type AiRunKind = "summary" | "embedding";
export type AiRunTargetType = "clip" | "feed_entry";

export interface EnqueuedAiRun {
  id: string;
  status?: string;
}

interface AiRunEnqueueService {
  enqueue(input: {
    userId: string;
    kind: AiRunKind;
    targetType: AiRunTargetType;
    targetId: string;
    inputVersion: number;
    priority?: number;
    idempotencyKey?: string;
  }): Promise<EnqueuedAiRun>;
}

let servicePromise: Promise<AiRunEnqueueService> | undefined;

export function enqueueSummaryRun(input: {
  userId: string;
  targetType: AiRunTargetType;
  targetId: string;
  inputVersion: number;
  manual?: boolean;
}) {
  return getService().then((service) => service.enqueue({
    userId: input.userId,
    kind: "summary",
    targetType: input.targetType,
    targetId: input.targetId,
    inputVersion: input.inputVersion,
    priority: input.manual ? 100 : 20,
    idempotencyKey: `${input.manual ? "manual:" : ""}summary:${input.targetType}:${input.targetId}:v${input.inputVersion}`,
  }));
}

export async function enqueueArticleRuns(input: {
  userId: string;
  targetType: AiRunTargetType;
  targetId: string;
  inputVersion: number;
}) {
  const service = await getService();
  return Promise.all(["summary", "embedding"].map((kind) => service.enqueue({
    userId: input.userId,
    kind: kind as AiRunKind,
    targetType: input.targetType,
    targetId: input.targetId,
    inputVersion: input.inputVersion,
    priority: kind === "summary" ? 20 : 10,
    idempotencyKey: `${kind}:${input.targetType}:${input.targetId}:v${input.inputVersion}`,
  })));
}

async function getService() {
  servicePromise ??= loadService();
  return servicePromise;
}

async function loadService(): Promise<AiRunEnqueueService> {
  const { createAiRunService } = await import("@mewmo/application");
  return createAiRunService();
}
