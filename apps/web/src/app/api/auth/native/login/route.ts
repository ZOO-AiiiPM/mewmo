import { NativeAuthError, createNativeAuthService } from "../../../../../lib/native-auth";
import { nativeLoginBodySchema } from "../../../../../lib/native-auth-contract";
import { getLoginRateLimiter } from "../../../../../lib/login-attempt-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const parsed = nativeLoginBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请求参数不完整", code: "invalid_request" }, { status: 400 });
  }

  const service = createNativeAuthService({ rateLimiter: getLoginRateLimiter() });

  try {
    const result = await service.login(parsed.data, request);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid email or password", code: "invalid_credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof NativeAuthError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
