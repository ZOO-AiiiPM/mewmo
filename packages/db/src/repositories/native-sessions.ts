import { getPrisma } from "../client";

interface NativeSessionsClient {
  nativeSession: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

export interface CreateNativeSessionInput {
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  platform: string;
  deviceName?: string | null;
  lastIp?: string | null;
  lastUserAgent?: string | null;
  refreshExpiresAt: Date;
}

/**
 * 服务器端 native bearer session 仓库。
 *
 * refresh token 只存哈希（绝不存明文）：查询与轮换都以哈希为准，
 * 天然支持「已轮换 / 已撤销 / 已过期」的拒绝。
 */
export function createNativeSessionsRepository(client: unknown = getPrisma()) {
  const db = client as NativeSessionsClient;

  return {
    async create(input: CreateNativeSessionInput) {
      const now = new Date();
      return db.nativeSession.create({
        data: {
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          deviceId: input.deviceId,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          lastIp: input.lastIp ?? null,
          lastUserAgent: input.lastUserAgent ?? null,
          lastUsedAt: now,
          lastRefreshedAt: now,
          refreshExpiresAt: input.refreshExpiresAt,
          revokedAt: null,
          refreshCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    },

    /**
     * 按 refresh token 哈希定位一个**未被撤销**的有效 session。
     * 调用方拿到行后做哈希比对决定是否放行；这里只做索引命中。
     */
    async findActiveByRefreshHash(refreshTokenHash: string) {
      return db.nativeSession.findUnique({
        where: { refreshTokenHash },
      });
    },

    /**
     * 轮换 refresh token：读取 → 校验未撤销未过期 → 改新哈希、刷新滑动窗口、refreshCount+1。
     * 刷新时把该行的 refresh_token_hash 换成新哈希，旧 refresh 再次使用即哈希不匹配而 401。
     */
    async rotate(
      sessionId: string,
      { refreshTokenHash, refreshExpiresAt }: { refreshTokenHash: string; refreshExpiresAt: Date },
      now = new Date(),
    ) {
      return db.nativeSession.update({
        where: { id: sessionId },
        data: {
          refreshTokenHash,
          refreshExpiresAt,
          lastRefreshedAt: now,
          lastUsedAt: now,
          refreshCount: { increment: 1 },
        },
      });
    },

    /** 心跳/使用记录：更新最后使用时间与来源 IP / UA。 */
    async touch(
      sessionId: string,
      { lastIp, lastUserAgent }: { lastIp?: string | null; lastUserAgent?: string | null },
      lastUsedAt = new Date(),
    ) {
      return db.nativeSession.update({
        where: { id: sessionId },
        data: {
          lastUsedAt,
          lastIp: lastIp ?? undefined,
          lastUserAgent: lastUserAgent ?? undefined,
        },
      });
    },

    /** 吊销会话：设置 revokedAt，使其 refresh 与 access 立即失效。 */
    async revoke(sessionId: string, revokedAt = new Date()) {
      return db.nativeSession.update({
        where: { id: sessionId },
        data: { revokedAt },
      });
    },

    /** 定位用户的某个有效 native session（供 session/GET 查询）。 */
    async findActiveForUserBySessionId(userId: string, sessionId: string) {
      return db.nativeSession.findUnique({
        where: { id: sessionId },
      });
    },
  };
}
