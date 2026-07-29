import type { ClaimedAiRun, ModelMetadata } from "../contracts";

export type WorkflowRunStatus = "succeeded" | "retrying" | "failed" | "superseded";
export type WorkflowModelObservationType = "generation" | "embedding" | "retriever";

export interface WorkflowModelObservationInput {
  name: string;
  purpose: string;
  type: WorkflowModelObservationType;
  input?: unknown;
  prompt?: { name: string; version: number; isFallback: boolean };
}

export interface WorkflowRunObservation {
  input(value: unknown): void;
  output(value: unknown): void;
}

export interface WorkflowObservabilityPort {
  observeRun(run: ClaimedAiRun, operation: (observation: WorkflowRunObservation) => Promise<WorkflowRunStatus>): Promise<WorkflowRunStatus>;
  observeModelCall<T>(input: WorkflowModelObservationInput, operation: () => Promise<{ value: T; metadata: ModelMetadata; output?: unknown }>): Promise<T>;
  shutdown(): Promise<void>;
}

export function createNoopWorkflowObservability(): WorkflowObservabilityPort {
  const observation = { input() {}, output() {} };
  return {
    observeRun: (_run, operation) => operation(observation),
    observeModelCall: async (_input, operation) => (await operation()).value,
    async shutdown() {},
  };
}
