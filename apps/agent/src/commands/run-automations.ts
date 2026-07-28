import { hostname } from "node:os";

import { loadFoundationAdapters } from "../adapters";
import { createAgentAutomationRunPort } from "../automation/adapters";
import { runAgentAutomationsOnce } from "../automation/run-batch";
import { loadAgentConfig } from "../config";
import { createConfiguredAgentObservability } from "../observability/langfuse";
import { createAgentRuntime } from "../runtime";

async function main() {
  const config = loadAgentConfig();
  const observability = createConfiguredAgentObservability(config);
  const adapters = await loadFoundationAdapters();
  const runtime = createAgentRuntime({
    ai: adapters.ai,
    application: adapters.application,
    maxSteps: config.AGENT_MAX_STEPS,
    timeoutMs: config.AGENT_TIMEOUT_MS,
    observability,
  });
  try {
    const result = await runAgentAutomationsOnce({
      runs: createAgentAutomationRunPort(),
      application: adapters.application,
      runtime,
      workerId: `${hostname()}:${process.pid}`,
      limit: numberEnv("AGENT_AUTOMATION_BATCH_LIMIT", 5),
      leaseMs: numberEnv("AGENT_AUTOMATION_LEASE_MS", 300_000),
    });
    console.log(JSON.stringify({ event: "agent_automations_completed", ...result }));
  } finally {
    await observability.shutdown();
  }
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

void main().catch((error: unknown) => {
  console.error("Agent automation worker failed", error);
  process.exitCode = 1;
});
