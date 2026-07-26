import { CredentialsSignin } from "@auth/core/errors";

// 错误基类直接取自 @auth/core/errors 而非 next-auth 的 re-export：next-auth 包入口会拖进
// next/server（纯 node 测试环境不可导入），而 @auth/core 在依赖树中是单实例，
// 与 NextAuth 运行时抛出的错误共享同一份类定义，instanceof 才可靠。调用方统一从这里取。
export { AuthError, CredentialsSignin } from "@auth/core/errors";

export const LOGIN_MAX_ATTEMPTS = 5; // 连续失败上限，达到后锁定
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 10 * 60; // 失败计数窗口
export const LOGIN_LOCK_SECONDS = 10 * 60; // 锁定时长；锁定期间继续失败会刷新锁

export const LOGIN_RATE_LIMITED_CODE = "login_rate_limited";

/**
 * 按「email + IP」维度的登录失败限速器。
 *
 * 只定义接口：实现放在 apps/web（复用 OTP 侧 Redis / 进程内降级的存储设施），
 * packages/auth 不能反向依赖 apps/web。
 */
export interface LoginRateLimiter {
  isLocked(email: string, ip: string): Promise<boolean>;
  recordFailure(email: string, ip: string): Promise<void>;
  clear(email: string, ip: string): Promise<void>;
}

/**
 * authorize 内命中限速时抛出。继承 CredentialsSignin 走 NextAuth 的凭证错误
 * 通道（不会升级成 500），code 供 /api/login 识别后映射为 429。
 */
export class LoginRateLimitError extends CredentialsSignin {
  code = LOGIN_RATE_LIMITED_CODE;
}

/**
 * 判断 signIn 抛出的错误是否源于登录限速。
 * NextAuth 可能原样抛出，也可能包一层 CallbackRouteError（原错误在 cause.err），
 * 且跨包场景下类实例可能不同一，所以沿 cause 链比对 code，不依赖 instanceof。
 */
export function isLoginRateLimitError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  if (error instanceof LoginRateLimitError) return true;
  if ((error as { code?: unknown }).code === LOGIN_RATE_LIMITED_CODE) return true;

  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return false;
  if (isLoginRateLimitError(cause, depth + 1)) return true;
  return isLoginRateLimitError((cause as { err?: unknown }).err, depth + 1);
}

/** 从请求头解析客户端 IP：x-forwarded-for 首项 → x-real-ip → "unknown"。 */
export function getClientIp(request?: Request): string {
  const headers = request?.headers;
  if (!headers) return "unknown";

  const forwardedFirst = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFirst) return forwardedFirst;

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
