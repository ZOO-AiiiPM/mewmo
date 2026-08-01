import { NativeAuthError, createNativeAuthService } from "../../../../../lib/native-auth";
import { NextResponse } from "next/server";

/**
 * 读取当前 bearer 会话的公开身份信息（设备 / 平台 / 最近使用）。
 * 需要 `Authorization: Bearer <native access token>`。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!bearer) {
    return NextResponse.json({ error: "缺少 access token", code: "unauthorized" }, { status: 401 });
  }

  const service = createNativeAuthService();

  try {
    const session = await service.getSessionInfo(bearer);
    if (!session) {
      return NextResponse.json({ error: "无效或已失效的会话", code: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ session }, { status: 200 });
  } catch (e) {
    if (e instanceof NativeAuthError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
