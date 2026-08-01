import { getPrisma } from "../client";

interface NativeSessionsClient {
  nativeSession: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
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

/** 轮换（CAS）输入：除旧哈希与目标 session 外的全部变更都一次性落到同一条 UPDATE。 */
export interface RotateIfCurrentInput {
  sessionId: string;
  oldRefreshTokenHash: string;
  newRefreshTokenHash: string;
  refreshExpiresAt: Date;
  lastIp?: string | null;
  lastUserAgent?: string | null;
  now?: Date;
}

/**
 * 服务器端 native bearer session 仓库。
 *
 * refresh token 只存哈希（绝不存明文）：查询与轮换都以哈希为准，
 * 天然支持「已轮换 / 已撤销 / 已过期」的拒绝。
 *
 * 原子轮换：`rotateIfCurrent` 用 `updateMany` + `WHERE`（sessionId + 旧 oldRefreshTokenHash +
 * 未撤销 + 未过期）做 row-level CAS。PostgreSQL 对该行 UPDATE 是原子的，并发重放旧 token 时
 * 只有一个请求的旧哈希仍匹配，其余 `count===0`。来源信息（lastIp / lastUserAgent）、滑动过期
 * 窗口与 refreshCount 都合并在同一条 UPDATE 语句里，不存在「已轮换但 touch 失败」的中间态。
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
     * 按 refresh token 哈希定位 session（用于 refresh 前的错误分类与 logout）
     */
    async findActiveByRefreshHash(refreshTokenHash: string) {
      return db.nativeSession.findUnique({
        where: { refreshTokenHash },
      });
    },

    /**
     * 原子轮换：只有「该 session 的旧哈希仍匹配、未撤销、未过期」时才会写。
     * 返回 `count`；调用方 `count === 0` 即 CAS 失败（并发重放 / 已注销 / 已过期），按 401 处理。
     */
    async rotateIfCurrent(input: RotateIfCurrentInput) {
      const now = input.now ?? new Date();
      return db.nativeSession.updateMany({
        where: {
          id: input.sessionId,
          refreshTokenHash: input.oldRefreshTokenHash,
          revokedAt: null,
          refreshExpiresAt: { gte: now },
        },
        data: {
          refreshTokenHash: input.newRefreshTokenHash,
          refreshExpiresAt: input.refreshExpiresAt,
          lastRefreshedAt: now,
          lastUsedAt: now,
          lastIp: input.lastIp ?? null,
          lastUserAgent: input.lastUserAgent ?? null,
          refreshCount: { increment: 1 },
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

    /** 吊销某用户下、且未撤销的会话（logout 的 bearer 定位路径，落实 user ownership）。 */
    async revokeForUserBySessionId(userId: string, sessionId: string, revokedAt = new Date()) {
      return db.nativeSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt },
      });
    },

    /** 定位某用户自己的会话（供 session/GET 与 access 撤销校验），同时约束 userId 与 sessionId。 */
    async findActiveForUserBySessionId(userId: string, sessionId: string) {
      return db.nativeSession.findFirst({
        where: { id: sessionId, userId },
      });
    },
  };
}
