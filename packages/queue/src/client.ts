import { loadEnv } from "@mewmo/shared";
import IORedis from "ioredis";

export function createRedisConnection(env = loadEnv()): unknown {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
