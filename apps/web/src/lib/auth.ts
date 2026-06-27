import NextAuth from "next-auth";
import { createAuthConfig } from "@mewmo/auth";

let _auth: ReturnType<typeof NextAuth> | null = null;

function getAuth() {
  if (!_auth) {
    _auth = NextAuth(createAuthConfig());
  }
  return _auth;
}

export const handlers = {
  GET: (...args: Parameters<typeof Response>) => getAuth().handlers.GET(...args),
  POST: (...args: Parameters<typeof Response>) => getAuth().handlers.POST(...args),
};

export async function auth() {
  return getAuth().auth();
}

export async function signIn(...args: Parameters<ReturnType<typeof NextAuth>["signIn"]>) {
  return getAuth().signIn(...args);
}

export async function signOut(...args: Parameters<ReturnType<typeof NextAuth>["signOut"]>) {
  return getAuth().signOut(...args);
}
