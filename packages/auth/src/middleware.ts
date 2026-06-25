import NextAuth, { type NextAuthResult } from "next-auth";

import { createAuthConfig, protectedRouteMatcher } from "./auth";

const authResult = NextAuth(createAuthConfig());

export const middleware: NextAuthResult["auth"] = authResult.auth;

export const config = {
  matcher: protectedRouteMatcher,
};
