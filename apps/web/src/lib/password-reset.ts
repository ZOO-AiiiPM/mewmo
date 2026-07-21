import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 无状态密码重置 token，HS256 JWT 实现。
 *
 * 为什么手写而不是引 jose/jsonwebtoken：
 * - next-auth 虽传递依赖 jose，但未显式声明；项目无 migration 体系且网络不稳，引入依赖有风险。
 * - 单一 alg（HS256）+ 单一 purpose 的 JWT 实现足够简单，手写 30 行即可，配测试覆盖边界。
 * - 复用 NEXTAUTH_SECRET 作为 HMAC 密钥，与 Auth.js 共享同一 secret 体系。
 *
 * 安全约束：
 * - 只接受 HS256，拒绝其他 alg（防止 alg 混淆攻击）。
 * - signature 比较用 timingSafeEqual。
 * - payload 必须含 purpose === "password_reset"，防止其他用途的 JWT 被复用为重置 token。
 * - TTL 15 分钟，exp 强制校验。
 */

const HEADER = { alg: "HS256", typ: "JWT" } as const;
const PURPOSE = "password_reset" as const;
export const PASSWORD_RESET_TTL_SECONDS = 15 * 60;

interface PasswordResetPayload {
  email: string;
  userId: string;
  purpose: typeof PURPOSE;
  iat: number;
  exp: number;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export interface SignPasswordResetInput {
  email: string;
  userId: string;
}

/**
 * 签发密码重置 token。secret 由调用方从 loadEnv().NEXTAUTH_SECRET 传入，
 * 保持本函数为纯函数、易测试。
 */
export function signPasswordResetToken(
  input: SignPasswordResetInput,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: PasswordResetPayload = {
    email: input.email,
    userId: input.userId,
    purpose: PURPOSE,
    iat: nowSeconds,
    exp: nowSeconds + PASSWORD_RESET_TTL_SECONDS,
  };

  const encodedHeader = base64urlEncode(JSON.stringify(HEADER));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
}

export type PasswordResetVerifyError =
  | "invalid_format"
  | "invalid_signature"
  | "expired"
  | "wrong_purpose";

export type PasswordResetVerifyResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; error: PasswordResetVerifyError };

/**
 * 验证密码重置 token。返回带 email/userId 的成功结果，或带错误码的失败结果。
 * 失败一律不抛异常，由调用方映射为 HTTP 响应。
 */
export function verifyPasswordResetToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): PasswordResetVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "invalid_format" };

  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
  const data = `${encodedHeader}.${encodedPayload}`;

  // signature 长度恒定（HMAC-SHA256 base64url = 43 字符），长度不等即可判定非法
  const expected = sign(data, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_signature" };
  }

  let header: unknown;
  try {
    header = JSON.parse(base64urlDecode(encodedHeader));
  } catch {
    return { ok: false, error: "invalid_format" };
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as { alg?: unknown }).alg !== "HS256"
  ) {
    return { ok: false, error: "invalid_format" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload));
  } catch {
    return { ok: false, error: "invalid_format" };
  }
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "invalid_format" };
  }

  const p = payload as Partial<PasswordResetPayload>;
  if (p.purpose !== PURPOSE) return { ok: false, error: "wrong_purpose" };
  if (typeof p.exp !== "number" || p.exp <= nowSeconds) {
    return { ok: false, error: "expired" };
  }
  if (typeof p.email !== "string" || typeof p.userId !== "string") {
    return { ok: false, error: "invalid_format" };
  }

  return { ok: true, email: p.email, userId: p.userId };
}
