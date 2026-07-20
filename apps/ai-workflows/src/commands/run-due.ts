import { hostname } from "node:os";

import type { AiWorkflowRuntimePorts } from "../runtime";
import { runAiWorkflowsOnce } from "../runtime";

export interface WorkflowAdapterModule {
  createAiWorkflowRuntimePorts(): Promise<AiWorkflowRuntimePorts> | AiWorkflowRuntimePorts;
}

async function main() {
  const adapterPath = process.env.AI_WORKFLOWS_ADAPTER_MODULE?.trim();
  if (!adapterPath) {
    throw new Error("AI_WORKFLOWS_ADAPTER_MODULE is required until the Foundation adapter is integrated");
  }
  const adapter = await import(adapterPath) as Partial<WorkflowAdapterModule>;
  if (typeof adapter.createAiWorkflowRuntimePorts !== "function") {
    throw new Error("Workflow adapter must export createAiWorkflowRuntimePorts()");
  }
  const ports = await adapter.createAiWorkflowRuntimePorts();
  const result = await runAiWorkflowsOnce(ports, {
    workerId: `${hostname()}:${process.pid}`,
    limit: numberEnv("AI_WORKFLOW_BATCH_LIMIT", 10),
    concurrency: numberEnv("AI_WORKFLOW_CONCURRENCY", 2),
  });
  console.log(JSON.stringify({ event: "ai_workflows_completed", ...result }));
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

void main().catch((error: unknown) => {
  console.error("AI workflows cron failed", error);
  process.exitCode = 1;
});
