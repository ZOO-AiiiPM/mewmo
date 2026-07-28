import type { ClaimedAiRun, ModelMetadata } from "../contracts";

export type WorkflowRunStatus = "succeeded" | "retrying" | "failed" | "superseded";
export type WorkflowModelObservationType = "generation" | "embedding" | "retriever";

export interface WorkflowModelObservationInput {
  name: string;
  purpose: string;
  type: WorkflowModelObservationType;
}

export interface WorkflowObservabilityPort {
  observeRun(run: ClaimedAiRun, operation: () => Promise<WorkflowRunStatus>): Promise<WorkflowRunStatus>;
  observeModelCall<T>(input: WorkflowModelObservationInput, operation: () => Promise<{ value: T; metadata: ModelMetadata }>): Promise<T>;
  shutdown(): Promise<void>;
}

export function createNoopWorkflowObservability(): WorkflowObservabilityPort {
  return {
    observeRun: (_run, operation) => operation(),
    observeModelCall: async (_input, operation) => (await operation()).value,
    async shutdown() {},
  };
}
