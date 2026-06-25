import { PrismaAdapter } from "@auth/prisma-adapter";
import { getPrisma } from "@mewmo/db";
import { loadEnv, type AppEnv } from "@mewmo/shared";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

export const protectedRouteMatcher = ["/app/:path*"];

export interface CreateAuthConfigOptions {
  env?: Record<string, string | undefined>;
  adapter?: Adapter;
}

export function createAuthConfig(options: CreateAuthConfigOptions = {}): NextAuthConfig {
  const env = loadEnv(options.env) as AppEnv;
  const adapter = options.adapter ?? PrismaAdapter(getPrisma());

  return {
    adapter,
    secret: env.NEXTAUTH_SECRET,
    trustHost: true,
    session: { strategy: "database" },
    providers: [
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
      }),
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      authorized({ auth }) {
        return Boolean(auth?.user);
      },
    },
  };
}
