import { z } from "zod";

const envSchema = z.object({
  AGENT_IDENTITY_SECRET: z.string().min(32),
  AGENT_IDENTITY_ISSUER: z.string().min(1).default("mewmo-web"),
  AGENT_IDENTITY_AUDIENCE: z.string().min(1).default("mewmo-agent"),
  AGENT_HOST: z.string().default("127.0.0.1"),
  AGENT_PORT: z.coerce.number().int().min(1).max(65_535).default(3101),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(12).default(6),
  AGENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000),
  AGENT_WORKER_ID: z.string().min(1).default("mewmo-agent"),
  AGENT_TURN_LEASE_MS: z.coerce.number().int().min(10_000).max(10 * 60_000).default(120_000),
  // Web access tools (Jina Reader/Search). Empty key disables the tools.
  JINA_API_KEY: z.string().default(""),
  AGENT_WEB_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
  AGENT_WEB_SEARCH_BUDGET: z.coerce.number().int().min(0).max(10).default(2),
  AGENT_WEB_FETCH_BUDGET: z.coerce.number().int().min(0).max(20).default(5),
  AGENT_WEB_CACHE_TTL_MS: z.coerce.number().int().min(0).max(3_600_000).default(300_000),
  AGENT_WEB_CACHE_MAX_ENTRIES: z.coerce.number().int().min(0).max(1_000).default(128),
});

export type AgentConfig = z.infer<typeof envSchema>;

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return envSchema.parse(env);
}
