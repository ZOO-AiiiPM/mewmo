import { hostname } from "node:os";

import { createAiWorkflowRuntimePorts } from "../adapters";
import { runAiWorkflowsOnce } from "../runtime";

async function main() {
  const ports = createAiWorkflowRuntimePorts();
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
