import { createAiRunService } from "@mewmo/application";

import type { AgentAutomationRunPort } from "./run-batch";

interface AiRunServicePort {
  claimDue(input: { workerId: string; limit: number; leaseMs: number; now: Date; kinds: ["agent_automation"] }): Promise<Array<{ id: string; userId: string; targetId: string; automationId: string | null; inputVersion: number; attempts: number }>>;
  getInput(run: unknown): Promise<unknown>;
  completeAgentAutomation(input: { runId: string; workerId: string; output: unknown }): Promise<unknown>;
  retryOrFail(input: { runId: string; workerId: string; error: unknown; now: Date; maxAttempts: number }): Promise<unknown>;
  supersede(input: { runId: string; workerId: string; reason: string }): Promise<unknown>;
}

export function createAgentAutomationRunPort(service: AiRunServicePort = createAiRunService() as AiRunServicePort): AgentAutomationRunPort {
  return {
    async claimDue(input) {
      return (await service.claimDue({ ...input, kinds: ["agent_automation"] })).map((run) => ({
        id: run.id,
        userId: run.userId,
        targetId: run.targetId,
        automationId: run.automationId,
        inputVersion: run.inputVersion,
        attempt: run.attempts,
      }));
    },
    async getInput(run) {
      const value = await service.getInput({
        id: run.id,
        userId: run.userId,
        kind: "agent_automation",
        targetType: "automation",
        targetId: run.targetId,
        automationId: run.automationId,
      }) as { id: string; chatId: string; prompt: string; skillName: string | null; version: number } | null;
      if (!value) return null;
      return {
        id: value.id,
        chatId: value.chatId,
        prompt: value.prompt,
        skillName: value.skillName,
        version: value.version,
      };
    },
    complete: (input) => service.completeAgentAutomation(input),
    retryOrFail: (input) => service.retryOrFail(input),
    supersede: (input) => service.supersede(input),
  };
}
