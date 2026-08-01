import { NativeAuthError, createNativeAuthService } from "../../../../../lib/native-auth";
import { nativeLogoutBodySchema } from "../../../../../lib/native-auth-contract";
import { NextResponse } from "next/server";

/**
 * 注销：吊销当前设备会话的 refresh 与 access 能力。
 *
 * 支持两种定位方式（可同时存在，都以调用者自己的会话为界）：
 * - body.refreshToken → 按 refresh 哈希定位并吊销。
 * - Authorization: Bearer <access> → 按 access 中的 sessionId 吊销。
 */
export async function POST(request: Request) {
  const parsed = nativeLogoutBodySchema.safeParse(await request.json().catch(() => null));
  const service = createNativeAuthService();

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  try {
    if (parsed.success && parsed.data.refreshToken) {
      await service.revokeByRefreshToken(parsed.data.refreshToken);
    }

    // native logout 必须至少携带一种身份，避免空注销成为探测面
    if (!bearer && !(parsed.success && parsed.data.refreshToken)) {
      return NextResponse.json({ error: "缺少身份标识", code: "invalid_request" }, { status: 400 });
    }

    if (bearer) {
      const identity = await service.resolveAccessToken(bearer);
      if (!identity) {
        return NextResponse.json(
          { error: "无效的 access token", code: "unauthorized" },
          { status: 401 },
        );
      }
      await service.revokeSession(identity.userId, identity.sessionId);
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof NativeAuthError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
