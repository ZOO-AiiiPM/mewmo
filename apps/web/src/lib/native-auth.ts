import {
  DUMMY_PASSWORD_HASH,
  NATIVE_ACCESS_TTL_SECONDS,
  NATIVE_REFRESH_TTL_SECONDS,
  generateRefreshToken,
  getClientIp,
  hashRefreshToken,
  normalizeDeviceId,
  normalizePlatform,
  signNativeAccessToken,
  verifyNativeAccessToken,
  verifyPassword,
  type LoginRateLimiter,
} from "@mewmo/auth";
import { createNativeSessionsRepository, getPrisma } from "@mewmo/db";
import { loadEnv } from "@mewmo/shared";

export interface NativeLoginInput {
  email: string;
  password: string;
  deviceId?: string | undefined;
  deviceName?: string | undefined;
  platform?: string | undefined;
}

export interface NativeLoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
  user: { id: string; email: string; name: string | null };
}

export interface NativeRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
}

export interface NativeSessionPublic {
  id: string;
  deviceId: string;
  platform: string;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

interface NativeAuthDeps {
  prisma?: ReturnType<typeof getPrisma>;
  secret?: string;
  rateLimiter?: LoginRateLimiter;
  comparePassword?: (password: string, hash: string) => Promise<boolean>;
  now?: () => Date;
}

type Repo = ReturnType<typeof createNativeSessionsRepository>;

/** 登录 / 刷新 / 注销失败的错误分类，供封装层映射为 HTTP 语义。 */
export class NativeAuthError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 429,
    readonly code: string,
  ) {
    super(message);
    this.name = "NativeAuthError";
  }
}

export const NATIVE_ERR_INVALID_CREDENTIALS = "invalid_credentials";
export const NATIVE_ERR_INVALID_REQUEST = "invalid_request";
export const NATIVE_ERR_INVALID_REFRESH = "invalid_refresh";
export const NATIVE_ERR_UNAUTHORIZED = "unauthorized";

function createNativeAuthService(deps: NativeAuthDeps = {}) {
  const prisma = deps.prisma ?? getPrisma();
  const repo: Repo = createNativeSessionsRepository(prisma);
  const secret = deps.secret ?? loadEnv().NEXTAUTH_SECRET;
  const rateLimiter = deps.rateLimiter;
  const comparePassword = deps.comparePassword ?? verifyPassword;
  const nowFn = deps.now ?? (() => new Date());

  function refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + NATIVE_REFRESH_TTL_SECONDS * 1000);
  }

  async function login(input: NativeLoginInput, request: Request): Promise<NativeLoginResult | null> {
    const email = input.email.toLowerCase().trim();
    const ip = getClientIp(request);

    if (rateLimiter && (await rateLimiter.isLocked(email, ip))) {
      throw new NativeAuthError("登录尝试过多，请稍后再试", 429, "rate_limited");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user?.password) {
      // 未注册（或仅 OAuth 无密码）也做一次同成本比对，抹平时序差（与 Web authorize 一致）
      await comparePassword(input.password, DUMMY_PASSWORD_HASH);
      await rateLimiter?.recordFailure(email, ip);
      return null;
    }

    const valid = await comparePassword(input.password, user.password);
    if (!valid) {
      await rateLimiter?.recordFailure(email, ip);
      return null;
    }
    await rateLimiter?.clear(email, ip);

    const now = nowFn();
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken, secret);
    const session = (await repo.create({
      userId: user.id,
      refreshTokenHash,
      deviceId: normalizeDeviceId(input.deviceId),
      platform: normalizePlatform(input.platform),
      deviceName: input.deviceName?.trim() ? input.deviceName.trim() : null,
      lastIp: ip === "unknown" ? null : ip,
      lastUserAgent: request.headers.get("user-agent"),
      refreshExpiresAt: refreshExpiry(now),
    })) as { id: string };

    const accessToken = await signNativeAccessToken(
      { userId: user.id, sessionId: session.id },
      secret,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: NATIVE_ACCESS_TTL_SECONDS,
      refreshExpiresIn: NATIVE_REFRESH_TTL_SECONDS,
      sessionId: session.id,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async function refresh(refreshToken: string, request: Request): Promise<NativeRefreshResult> {
    if (!refreshToken || refreshToken.length < 16 || refreshToken.length > 1000) {
      throw new NativeAuthError("无效的 refresh token", 401, NATIVE_ERR_INVALID_REFRESH);
    }

    const hash = hashRefreshToken(refreshToken, secret);
    const session = (await repo.findActiveByRefreshHash(hash)) as
      | {
          id: string;
          userId: string;
          revokedAt: Date | null;
          refreshExpiresAt: Date;
        }
      | null;

    if (!session) {
      throw new NativeAuthError("无效的 refresh token", 401, NATIVE_ERR_INVALID_REFRESH);
    }
    if (session.revokedAt) {
      throw new NativeAuthError("会话已注销", 401, NATIVE_ERR_INVALID_REFRESH);
    }

    const now = nowFn();
    if (session.refreshExpiresAt.getTime() < now.getTime()) {
      throw new NativeAuthError("refresh token 已过期", 401, NATIVE_ERR_INVALID_REFRESH);
    }

    // 轮换：旧 refresh 哈希换成新哈希，旧 refresh 再次使用即哈希不匹配 → 401
    const nextRefreshToken = generateRefreshToken();
    const nextHash = hashRefreshToken(nextRefreshToken, secret);
    await repo.rotate(session.id, {
      refreshTokenHash: nextHash,
      refreshExpiresAt: refreshExpiry(now),
    });
    const ip = getClientIp(request);
    await repo.touch(session.id, {
      lastIp: ip === "unknown" ? null : ip,
      lastUserAgent: request.headers.get("user-agent"),
    });

    const accessToken = await signNativeAccessToken(
      { userId: session.userId, sessionId: session.id },
      secret,
    );

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: NATIVE_ACCESS_TTL_SECONDS,
      refreshExpiresIn: NATIVE_REFRESH_TTL_SECONDS,
      sessionId: session.id,
    };
  }

  /** 按 refresh token 吊销该会话（logout 主路径）。 */
  async function revokeByRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new NativeAuthError("缺少 refresh token", 400, NATIVE_ERR_INVALID_REQUEST);
    }
    const hash = hashRefreshToken(refreshToken, secret);
    const session = (await repo.findActiveByRefreshHash(hash)) as { id: string } | null;
    if (!session) {
      // 已经轮换 / 已注销 / 未知：视为幂等成功，避免泄漏会话是否已失效。
      return;
    }
    await repo.revoke(session.id, nowFn());
  }

  /** 按 sessionId 直接吊销（logout 的 bearer 定位路径）。 */
  async function revokeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    await repo.revoke(sessionId, nowFn());
  }

  /**
   * bearer 访问 token → 当前用户身份。校验签名 + 未过期 + 会话未被注销。
   * 命中任一（坏 token / 过期 / 已注销）返回 null，调用方按 401 处理，不透出 token 细节。
   */
  async function resolveAccessToken(accessToken: string) {
    if (!accessToken) return null;
    const verified = await verifyNativeAccessToken(accessToken, secret);
    if (!verified || verified.expired) return null;

    // 注销即失效：即使 access 未过期，被注销的会话也不得再访问数据接口。
    const session = (await repo.findActiveForUserBySessionId(
      verified.payload.userId,
      verified.payload.sessionId,
    )) as { revokedAt: Date | null } | null;
    if (!session || session.revokedAt) return null;

    return verified.payload;
  }

  /** session/GET：读取当前 bearer 会话的公开信息。 */
  async function getSessionInfo(accessToken: string): Promise<NativeSessionPublic | null> {
    const identity = await resolveAccessToken(accessToken);
    if (!identity) return null;

    const session = (await repo.findActiveForUserBySessionId(
      identity.userId,
      identity.sessionId,
    )) as NativeSessionPublic | null;
    if (!session || (session as { revokedAt?: Date | null }).revokedAt) return null;

    return {
      id: session.id,
      deviceId: session.deviceId,
      platform: session.platform,
      deviceName: session.deviceName,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastUsedAt: session.lastUsedAt,
    };
  }

  return { login, refresh, revokeByRefreshToken, revokeSession, resolveAccessToken, getSessionInfo };
}

export type NativeAuthService = ReturnType<typeof createNativeAuthService>;

export { createNativeAuthService };
