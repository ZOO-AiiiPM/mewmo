import { loadFoundationAdapters } from "./adapters";
import { loadAgentConfig } from "./config";
import { createAgentRuntime } from "./runtime";
import { buildAgentServer } from "./server";
import { createJinaWebAdapter } from "./web/jina-adapter";

const config = loadAgentConfig();
const adapters = await loadFoundationAdapters();
const web = config.JINA_API_KEY
  ? createJinaWebAdapter({
      apiKey: config.JINA_API_KEY,
      timeoutMs: config.AGENT_WEB_TIMEOUT_MS,
      cacheTtlMs: config.AGENT_WEB_CACHE_TTL_MS,
      cacheMaxEntries: config.AGENT_WEB_CACHE_MAX_ENTRIES,
    })
  : undefined;
const runtime = createAgentRuntime({
  ai: adapters.ai,
  application: adapters.application,
  maxSteps: config.AGENT_MAX_STEPS,
  timeoutMs: config.AGENT_TIMEOUT_MS,
  ...(web ? { web, webSearchBudget: config.AGENT_WEB_SEARCH_BUDGET, webFetchBudget: config.AGENT_WEB_FETCH_BUDGET } : {}),
});
const server = buildAgentServer({ config, runtime, application: adapters.application });

await server.listen({ host: config.AGENT_HOST, port: config.AGENT_PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}
