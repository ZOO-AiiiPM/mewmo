import { NativeAuthError, createNativeAuthService } from "../../../../../lib/native-auth";
import { nativeRefreshBodySchema } from "../../../../../lib/native-auth-contract";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const parsed = nativeRefreshBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数不完整", code: "invalid_request" }, { status: 400 });
  }

  const service = createNativeAuthService();

  try {
    const result = await service.refresh(parsed.data.refreshToken, request);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof NativeAuthError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
