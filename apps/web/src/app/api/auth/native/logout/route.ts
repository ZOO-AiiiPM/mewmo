import { NativeAuthError, createNativeAuthService } from "../../../../../lib/native-auth";
import { nativeLogoutBodySchema } from "../../../../../lib/native-auth-contract";
import { NextResponse } from "next/server";

/**
 * 注销：吊销当前设备会话的 refresh 与 access 能力。
 *
 * 支持两种定位方式（可同时存在，都以调用者自己的会话为界）：
 * - body.refreshToken → 按 refresh 哈希定位并吊销（**权威路径**）。
 * - Authorization: Bearer <access> → 按 access 中的 sessionId 吊销（refresh 不可用时兜底）。
 *
 * 语义：
 * - 有效 refresh 一旦吊销会话，注销即已成功 → 204，不再让后续 bearer 解析失败覆盖成 401。
 * - 无有效 refresh 时，bearer 是唯一身份，必须有效才放行（无效 bearer 不可绕过）。
 */
export async function POST(request: Request) {
  const parsed = nativeLogoutBodySchema.safeParse(await request.json().catch(() => null));
  const service = createNativeAuthService();

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  try {
    // native logout 必须至少携带一种身份，避免空注销成为探测面
    const hasRefresh = Boolean(parsed.success && parsed.data.refreshToken);
    if (!bearer && !hasRefresh) {
      return NextResponse.json({ error: "缺少身份标识", code: "invalid_request" }, { status: 400 });
    }

    // 权威路径：有效 refresh 定位并吊销会话 → 注销完成，与 bearer 无关。
    if (parsed.success && parsed.data.refreshToken) {
      const revoked = await service.revokeByRefreshToken(parsed.data.refreshToken);
      if (revoked) {
        return new NextResponse(null, { status: 204 });
      }
    }

    // refresh 缺失或未定位到会话（未知/已轮换）：bearer 兜底，且必须有效，否则不可绕过。
    if (bearer) {
      const identity = await service.resolveAccessToken(bearer);
      if (!identity) {
        return NextResponse.json(
          { error: "无效的 access token", code: "unauthorized" },
          { status: 401 },
        );
      }
      await service.revokeSession(identity.userId, identity.sessionId);
      return new NextResponse(null, { status: 204 });
    }

    // 既无有效 refresh 也无有效 bearer：无法完成注销 → 400（无 bearer 且 refresh 未命中时唯一身份缺失）
    return NextResponse.json({ error: "缺少有效身份标识", code: "invalid_request" }, { status: 400 });
  } catch (e) {
    if (e instanceof NativeAuthError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
