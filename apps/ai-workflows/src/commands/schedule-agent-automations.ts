import { createAiAutomationService } from "@mewmo/application";

export async function scheduleAgentAutomationsOnce(options: { now?: Date; limit?: number } = {}) {
  return createAiAutomationService().enqueueDue(options);
}

async function main() {
  const runs = await scheduleAgentAutomationsOnce({ limit: numberEnv("AI_AUTOMATION_SCHEDULE_LIMIT", 50) });
  console.log(JSON.stringify({ event: "agent_automations_scheduled", enqueued: runs.length }));
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

if (process.argv[1]?.endsWith("schedule-agent-automations.ts") || process.argv[1]?.endsWith("schedule-agent-automations.js")) {
  void main().catch((error: unknown) => {
    console.error("Agent automation scheduler failed", error);
    process.exitCode = 1;
  });
}
