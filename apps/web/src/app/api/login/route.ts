import { NextResponse } from "next/server";

import { signIn } from "../../../lib/auth";
import { mapLoginError, parseLoginBody } from "../../../lib/login-request";

export async function POST(request: Request) {
  const body = parseLoginBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
  }

  try {
    await signIn("credentials", {
      email: body.email,
      password: body.password,
      redirect: false,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mapped = mapLoginError(e);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    throw e;
  }
}
