import type { AiWorkflowApplicationPort, WorkflowHandlerContext } from "../contracts";
import { executeClaimedRun } from "./execute-run";

export interface WorkflowBatchResult {
  claimed: number;
  succeeded: number;
  retrying: number;
  failed: number;
  superseded: number;
}

export async function runWorkflowBatch(input: {
  application: AiWorkflowApplicationPort;
  context: WorkflowHandlerContext;
  workerId: string;
  limit?: number;
  concurrency?: number;
  leaseMs?: number;
  taskTimeoutMs?: number;
  now?: () => Date;
}): Promise<WorkflowBatchResult> {
  const now = input.now ?? (() => new Date());
  const limit = clamp(input.limit ?? 10, 1, 100);
  const concurrency = clamp(input.concurrency ?? 2, 1, Math.min(limit, 8));
  const runs = await input.application.claimDue({
    workerId: input.workerId,
    limit,
    leaseMs: input.leaseMs ?? 55_000,
    now: now(),
  });
  const result: WorkflowBatchResult = {
    claimed: runs.length,
    succeeded: 0,
    retrying: 0,
    failed: 0,
    superseded: 0,
  };
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, runs.length) }, async () => {
    while (nextIndex < runs.length) {
      const run = runs[nextIndex++];
      if (!run) return;
      const status = await executeClaimedRun({
        run,
        application: input.application,
        context: input.context,
        workerId: input.workerId,
        timeoutMs: input.taskTimeoutMs ?? 45_000,
        now,
      });
      result[status] += 1;
    }
  }));
  return result;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}
