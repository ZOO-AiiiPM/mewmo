import type { AiRuntimePort, AiWorkflowApplicationPort } from "./contracts";
import { runWorkflowBatch } from "./engine/run-batch";
import { loadWorkflowPrompt } from "./prompts";

export interface AiWorkflowRuntimePorts {
  ai: AiRuntimePort;
  application: AiWorkflowApplicationPort;
}

export async function runAiWorkflowsOnce(
  ports: AiWorkflowRuntimePorts,
  options: {
    workerId: string;
    limit?: number;
    concurrency?: number;
    now?: () => Date;
  },
) {
  return runWorkflowBatch({
    application: ports.application,
    context: { ai: ports.ai, loadPrompt: loadWorkflowPrompt },
    workerId: options.workerId,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}
