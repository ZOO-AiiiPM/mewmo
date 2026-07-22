import { hostname } from "node:os";

import { loadFoundationAdapters } from "../adapters";
import { createAgentAutomationRunPort } from "../automation/adapters";
import { runAgentAutomationsOnce } from "../automation/run-batch";
import { createAgentRuntime } from "../runtime";

async function main() {
  const adapters = await loadFoundationAdapters();
  const runtime = createAgentRuntime({
    ai: adapters.ai,
    application: adapters.application,
    maxSteps: numberEnv("AGENT_MAX_STEPS", 6),
    timeoutMs: numberEnv("AGENT_TIMEOUT_MS", 45_000),
  });
  const result = await runAgentAutomationsOnce({
    runs: createAgentAutomationRunPort(),
    application: adapters.application,
    runtime,
    workerId: `${hostname()}:${process.pid}`,
    limit: numberEnv("AGENT_AUTOMATION_BATCH_LIMIT", 5),
    leaseMs: numberEnv("AGENT_AUTOMATION_LEASE_MS", 300_000),
  });
  console.log(JSON.stringify({ event: "agent_automations_completed", ...result }));
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

void main().catch((error: unknown) => {
  console.error("Agent automation worker failed", error);
  process.exitCode = 1;
});
