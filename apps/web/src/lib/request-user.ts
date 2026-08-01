import { createNativeAuthService } from "./native-auth";
import { auth } from "./auth";

export interface ResolvedUser {
  id: string;
  /** native bearer session id（仅 native 模式有）。 */
  sessionId?: string;
}

/**
 * 解析当前请求的认证身份，供数据接口做 userId ownership 过滤。
 *
 * 规则：
 * 1. 请求带 `Authorization: Bearer <native access token>` → 校验原生 short-lived token，
 *    从未过期则返回 userId（native 模式，无 cookie）。
 * 2. 否则回退到 NextAuth cookie session（Web 路径完全不变）。
 *
 * 校验失败统一返回 null（401），既不坏 Web 也不向 native 透出 token 细节。
 */
export async function resolveRequestUser(request: Request): Promise<ResolvedUser | null> {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearer) {
    const identity = await createNativeAuthService().resolveAccessToken(bearer);
    if (!identity) return null;
    return { id: identity.userId, sessionId: identity.sessionId };
  }

  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id };
}
