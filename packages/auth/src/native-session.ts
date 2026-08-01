import { SignJWT, errors, jwtVerify, type JWTPayload } from "jose";
import { createHmac, randomBytes } from "node:crypto";

export const NATIVE_ACCESS_TTL_SECONDS = 15 * 60; // 短期 access token：15 分钟
export const NATIVE_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 长期 refresh token：30 天（滑动式）

export const NATIVE_PLATFORMS = ["macos", "ios", "ipados"] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

const NATIVE_ACCESS_KIND = "native_access";

export interface NativeAccessPayload {
  userId: string;
  sessionId: string;
}

export interface NativeAccessClaims extends NativeAccessPayload {
  kind: typeof NATIVE_ACCESS_KIND;
  scope: "native";
  /** registered claims（iat/nbf/exp）由 jose 写入/读取。 */
  exp?: number;
  iat?: number;
  nbf?: number;
}

/** 把 NEXTAUTH_SECRET 编码为 HS256 所需 key（jose 走 Uint8Array）。 */
export function nativeSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * 签发原生 access token（HS256 JWT）。access token 是无状态签名，不落库；
 * 校验方只需同一 `NEXTAUTH_SECRET` 验签并读 `sub`/`sid`。
 */
export async function signNativeAccessToken(
  payload: NativeAccessPayload,
  secret: string,
  ttlSeconds = NATIVE_ACCESS_TTL_SECONDS,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claims: NativeAccessClaims = {
    kind: NATIVE_ACCESS_KIND,
    scope: "native",
    userId: payload.userId,
    sessionId: payload.sessionId,
  };
  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(nativeSecretKey(secret));
}

export interface VerifiedNativeAccess {
  payload: NativeAccessClaims;
  /** token 是否已过期或 nbf 未到（校验方据此返回 401）。 */
  expired: boolean;
}

/**
 * 校验原生 access token。只负责验签与解析 claims，
 * 过期判定（`expired=true`）与撤销判定留给调用方按业务返回 401/410。
 */
/**
 * 校验原生 access token。只负责验签与解析 claims。
 * - 验签 / claims 非法 → 返回 null（调用方按 401 处理）。
 * - 签名合法但已过期 → 返回 claims 且 `expired=true`（调用方按 401 处理，但保留身份用于语义区分）。
 */
export async function verifyNativeAccessToken(
  token: string,
  secret: string,
): Promise<VerifiedNativeAccess | null> {
  const key = nativeSecretKey(secret);
  let payload: NativeAccessClaims;
  let expired = false;

  try {
    const { payload: verified } = await jwtVerify<NativeAccessClaims>(token, key, {
      algorithms: ["HS256"],
      typ: "JWT",
    });
    payload = verified;
  } catch (e) {
    if (e instanceof errors.JWTExpired) {
      // 仅过期：jwtVerify 抛 JWTExpired，但签名与 claims 已验证通过。
      // 解码回放 claims 供身份读取（expired 已标记，不会放行。
      const decoded = decodeTokenClaims<NativeAccessClaims>(token);
      if (!decoded) return null;
      payload = decoded;
      expired = true;
    } else {
      // 坏签名 / 篡改 / 格式错误：一律 null，不泄露校验细节。
      return null;
    }
  }

  if (payload.kind !== NATIVE_ACCESS_KIND || payload.scope !== "native") return null;
  if (typeof payload.userId !== "string" || typeof payload.sessionId !== "string") return null;

  const now = Math.floor(Date.now() / 1000);
  if (!expired) {
    expired = Boolean(payload.exp && payload.exp < now);
  }

  return {
    payload: {
      userId: payload.userId,
      sessionId: payload.sessionId,
      kind: NATIVE_ACCESS_KIND,
      scope: "native",
    },
    expired,
  };
}

/**
 * 不改签地解码一个已知合法的 JWT claims（仅在签名验证已通过、随后判定过期时使用）。
 * 任何失败返回 null。
 */
function decodeTokenClaims<T>(token: string): T | null {
  const header = token.split(".")[0];
  if (!header) return null;
  try {
    // base64url → JSON，仅用于读取已验签过的 payload，不做信任边界。
    const seg = token.split(".");
    const payloadB64 = seg[1];
    if (!payloadB64 || seg.length < 3) return null;
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * 生成 opaque refresh token（随机 32 字节 base64url）。
 * 只作为纯串传递，服务端存/查统一走 `hashRefreshToken` 的哈希。
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** refresh token 入库 / 比对用哈希：HMAC-SHA256（加 server 端 secret 盐），绝不明文存库。 */
export function hashRefreshToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** 规范化 platform 入参：非法值回退到 `ios`，避免脏数据进库。 */
export function normalizePlatform(raw: unknown): NativePlatform {
  if (typeof raw === "string" && (NATIVE_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as NativePlatform;
  }
  return "ios";
}

/** 规范化 deviceId 入参：空串/非字符串回退到 `device-<now>` 稳定随机串，保证每会话有独立身份。 */
export function normalizeDeviceId(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0 && raw.trim().length <= 128) {
    return raw.trim();
  }
  return `device-${generateRefreshToken().slice(0, 18)}`;
}
