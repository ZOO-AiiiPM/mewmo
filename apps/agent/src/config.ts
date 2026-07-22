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
});

export type AgentConfig = z.infer<typeof envSchema>;

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return envSchema.parse(env);
}
