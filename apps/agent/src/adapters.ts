import type { AgentModelPort, ApplicationPort } from "./ports";

export interface FoundationAdapters {
  models: AgentModelPort;
  application: ApplicationPort;
}

export async function loadFoundationAdapters(): Promise<FoundationAdapters> {
  throw new Error(
    "Foundation adapters are not linked. Inject @mewmo/ai createAIRuntime().languageModel and @mewmo/application services before starting apps/agent.",
  );
}
