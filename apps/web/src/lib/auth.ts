import NextAuth from "next-auth";
import { createAuthConfig } from "@mewmo/auth";

let _auth: ReturnType<typeof NextAuth> | null = null;
type AuthResult = ReturnType<typeof NextAuth>;
type AuthHandlers = AuthResult["handlers"];

function getAuth() {
  if (!_auth) {
    _auth = NextAuth(createAuthConfig());
  }
  return _auth;
}

export const handlers: AuthHandlers = {
  GET: (...args: Parameters<AuthHandlers["GET"]>) => getAuth().handlers.GET(...args),
  POST: (...args: Parameters<AuthHandlers["POST"]>) => getAuth().handlers.POST(...args),
};

export async function auth() {
  return getAuth().auth();
}

export async function signIn(...args: Parameters<AuthResult["signIn"]>) {
  return getAuth().signIn(...args);
}

export async function signOut(...args: Parameters<AuthResult["signOut"]>) {
  return getAuth().signOut(...args);
}
