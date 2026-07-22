import type { AgentActor, AgentMessageResponse } from "../contracts";
import type { AgentRuntimePort, ApplicationPort } from "../ports";

export interface AgentAutomationRun {
  id: string;
  userId: string;
  targetId: string;
  automationId: string | null;
  inputVersion: number;
  attempt: number;
}

export interface AgentAutomationInput {
  id: string;
  chatId: string;
  prompt: string;
  skillName: string | null;
  version: number;
}

export interface AgentAutomationRunPort {
  claimDue(input: { workerId: string; limit: number; leaseMs: number; now: Date }): Promise<AgentAutomationRun[]>;
  getInput(run: AgentAutomationRun): Promise<AgentAutomationInput | null>;
  complete(input: { runId: string; workerId: string; output: AgentMessageResponse }): Promise<unknown>;
  retryOrFail(input: { runId: string; workerId: string; error: unknown; now: Date; maxAttempts: number }): Promise<unknown>;
  supersede(input: { runId: string; workerId: string; reason: string }): Promise<unknown>;
}

export async function runAgentAutomationsOnce(input: {
  runs: AgentAutomationRunPort;
  application: ApplicationPort;
  runtime: AgentRuntimePort;
  workerId: string;
  limit?: number;
  leaseMs?: number;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const claimed = await input.runs.claimDue({
    workerId: input.workerId,
    limit: clamp(input.limit ?? 5, 1, 25),
    leaseMs: input.leaseMs ?? 5 * 60_000,
    now: now(),
  });
  const result = { claimed: claimed.length, succeeded: 0, retrying: 0, superseded: 0 };
  for (const run of claimed) {
    let turn: { actor: AgentActor; turnId: string } | undefined;
    try {
      const automation = await input.runs.getInput(run);
      if (!automation) {
        await input.runs.supersede({ runId: run.id, workerId: input.workerId, reason: "automation_missing_or_disabled" });
        result.superseded += 1;
        continue;
      }
      if (automation.version !== run.inputVersion) {
        await input.runs.supersede({ runId: run.id, workerId: input.workerId, reason: "automation_version_changed" });
        result.superseded += 1;
        continue;
      }
      const actor = automationActor(run);
      const clientRequestId = `automation:${run.id}:attempt:${run.attempt}`;
      const started = await input.application.turns.begin({
        actor,
        chatId: automation.chatId,
        clientRequestId,
        content: automation.prompt,
        workerId: input.workerId,
        leaseMs: input.leaseMs ?? 5 * 60_000,
      });
      if (started.cached) {
        await input.runs.complete({ runId: run.id, workerId: input.workerId, output: started.cached });
        result.succeeded += 1;
        continue;
      }
      turn = { actor, turnId: started.turnId };
      const generated = await input.runtime.run({
        actor,
        chatId: automation.chatId,
        turnId: started.turnId,
        workerId: input.workerId,
        request: {
          clientRequestId,
          content: automation.prompt,
          skillId: automation.skillName ?? undefined,
          context: null,
        },
      });
      const response = await input.application.turns.complete({
        actor,
        turnId: started.turnId,
        workerId: input.workerId,
        assistantEntryId: generated.assistantEntryId,
        proposals: generated.proposals,
      });
      await input.runs.complete({ runId: run.id, workerId: input.workerId, output: response });
      result.succeeded += 1;
    } catch (error) {
      if (turn) {
        await input.application.turns.fail({
          actor: turn.actor,
          turnId: turn.turnId,
          workerId: input.workerId,
          code: "agent_automation_failed",
          message: error instanceof Error ? error.message : "Agent automation failed",
        }).catch(() => undefined);
      }
      await input.runs.retryOrFail({ runId: run.id, workerId: input.workerId, error, now: now(), maxAttempts: 3 });
      result.retrying += 1;
    }
  }
  return result;
}

function automationActor(run: AgentAutomationRun): AgentActor {
  return {
    userId: run.userId,
    source: "internal-agent",
    clientId: `automation-run:${run.id}`,
    scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}
