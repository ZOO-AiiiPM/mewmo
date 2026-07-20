import { loadFoundationAdapters } from "./adapters";
import { loadAgentConfig } from "./config";
import { createAgentRuntime } from "./runtime";
import { buildAgentServer } from "./server";

const config = loadAgentConfig();
const adapters = await loadFoundationAdapters();
const runtime = createAgentRuntime({
  models: adapters.models,
  application: adapters.application,
  maxSteps: config.AGENT_MAX_STEPS,
  timeoutMs: config.AGENT_TIMEOUT_MS,
});
const server = buildAgentServer({ config, runtime, application: adapters.application });

await server.listen({ host: config.AGENT_HOST, port: config.AGENT_PORT });
