import IORedis from "ioredis";

let client: IORedis | null = null;

/**
 * 进程级共享 Redis 连接（OTP 存储与登录限速共用，避免每个用途各开一条连接）。
 * REDIS_URL 未配置时抛错，由调用方负责降级到进程内实现。
 */
export function getRedisClient(): IORedis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not configured");
    client = new IORedis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}
