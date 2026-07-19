import { loadEnv } from "@mewmo/shared";
import IORedis from "ioredis";

type RedisConnectionMode = "producer" | "worker";

interface RedisConnectionOptions {
  mode?: RedisConnectionMode;
}

export function normalizeRedisUrl(value: string): string {
  const url = new URL(value);

  // Upstash's public Redis endpoint requires TLS. Normalizing here also
  // protects local environments that were configured with redis:// by mistake.
  if (url.protocol === "redis:" && url.hostname.endsWith(".upstash.io")) {
    url.protocol = "rediss:";
  }

  return url.toString();
}

export function createRedisConnection(
  env = loadEnv(),
  options: RedisConnectionOptions = {},
): unknown {
  const mode = options.mode ?? "producer";

  return new IORedis(normalizeRedisUrl(env.REDIS_URL), {
    connectTimeout: 5_000,
    maxRetriesPerRequest: mode === "worker" ? null : 1,
    ...(mode === "producer"
      ? {
          retryStrategy: (attempt: number) => (attempt <= 2 ? attempt * 250 : null),
        }
      : {}),
  });
}

export function createRedisWorkerConnection(env = loadEnv()): unknown {
  return createRedisConnection(env, { mode: "worker" });
}
