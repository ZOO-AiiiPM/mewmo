import { loadEnv } from "@mewmo/shared";
import IORedis from "ioredis";

export interface RedisConnectionOptions {
  maxRetriesPerRequest?: number | null;
}

export function createRedisConnection(env = loadEnv(), options: RedisConnectionOptions = {}): unknown {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
  });
}

export function createProducerRedisConnection(env = loadEnv()): unknown {
  return createRedisConnection(env, { maxRetriesPerRequest: 3 });
}
