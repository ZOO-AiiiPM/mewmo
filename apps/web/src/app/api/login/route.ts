import { signIn } from "../../../lib/auth";
import { AuthError } from "next-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    throw e;
  }
}
