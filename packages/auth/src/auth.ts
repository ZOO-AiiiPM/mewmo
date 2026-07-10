import { PrismaAdapter } from "@auth/prisma-adapter";
import { ensureOnboardingNotes, getPrisma } from "@mewmo/db";
import { loadEnv, type AppEnv } from "@mewmo/shared";
import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

export const protectedRouteMatcher = ["/app/:path*"];

export interface CreateAuthConfigOptions {
  env?: Record<string, string | undefined>;
  adapter?: Adapter;
  ensureAccountOnboarding?: (userId: string) => Promise<unknown>;
}

export function createAuthConfig(options: CreateAuthConfigOptions = {}): NextAuthConfig {
  const env = loadEnv(options.env) as AppEnv;
  const prisma = getPrisma();
  const adapter = options.adapter ?? PrismaAdapter(prisma);
  const ensureAccountOnboarding =
    options.ensureAccountOnboarding ??
    ((userId: string) => ensureOnboardingNotes(prisma, userId));

  return {
    adapter,
    secret: env.NEXTAUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt" },
    pages: {
      signIn: "/login",
    },
    providers: [
      Credentials({
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user || !user.password) return null;

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.password,
          );

          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.name, image: user.image };
        },
      }),
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
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token?.id) {
          session.user.id = token.id as string;
        }
        return session;
      },
      authorized({ auth }) {
        return Boolean(auth?.user);
      },
    },
    events: {
      async createUser({ user }) {
        if (!user.id) return;
        await ensureAccountOnboarding(user.id);
      },
    },
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
