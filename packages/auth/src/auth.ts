import { PrismaAdapter } from "@auth/prisma-adapter";
import { ensureOnboardingNotes, getPrisma } from "@mewmo/db";
import { loadEnv, type AppEnv } from "@mewmo/shared";
import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { getClientIp, LoginRateLimitError, type LoginRateLimiter } from "./login-rate-limit";

export const protectedRouteMatcher = ["/app/:path*"];

/**
 * 固定 bcrypt hash（cost 12，与 hashPassword 一致）。user 不存在或没有密码时
 * 也比对一次，抹平「邮箱已注册 vs 未注册」的响应时间差，防时序枚举。
 */
export const DUMMY_PASSWORD_HASH = "$2b$12$vBdnLOsrU0tzGvS7Eak.ze3Hzf5Q5EYLr.h4e1FNUGTD7eYZDlAKC";

export interface CreateAuthConfigOptions {
  env?: Record<string, string | undefined>;
  adapter?: Adapter;
  ensureAccountOnboarding?: (userId: string) => Promise<unknown>;
  /** 登录失败限速器；不传则不限速（apps/web 生产接线必传）。 */
  loginRateLimiter?: LoginRateLimiter;
  /** 测试注入口，默认走真实数据库。 */
  prisma?: ReturnType<typeof getPrisma>;
  /** 测试注入口，默认走 bcrypt.compare。 */
  comparePassword?: (password: string, hash: string) => Promise<boolean>;
}

export function createAuthConfig(options: CreateAuthConfigOptions = {}): NextAuthConfig {
  const env = loadEnv(options.env) as AppEnv;
  const prisma = options.prisma ?? getPrisma();
  const adapter = options.adapter ?? PrismaAdapter(prisma);
  const ensureAccountOnboarding =
    options.ensureAccountOnboarding ??
    ((userId: string) => ensureOnboardingNotes(prisma, userId));
  const loginRateLimiter = options.loginRateLimiter;
  const comparePassword =
    options.comparePassword ?? ((password: string, hash: string) => bcrypt.compare(password, hash));

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
        async authorize(credentials, request) {
          const email = typeof credentials?.email === "string" ? credentials.email : "";
          const password = typeof credentials?.password === "string" ? credentials.password : "";
          if (!email || !password) return null;

          const ip = getClientIp(request);

          // 锁定检查放在查库之前：锁定响应与邮箱是否注册无关，不新增枚举信号
          if (loginRateLimiter && (await loginRateLimiter.isLocked(email, ip))) {
            throw new LoginRateLimitError();
          }

          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user?.password) {
            // 邮箱未注册（或仅 OAuth 无密码）也做一次同成本比对，抹平时序差
            await comparePassword(password, DUMMY_PASSWORD_HASH);
            await loginRateLimiter?.recordFailure(email, ip);
            return null;
          }

          const valid = await comparePassword(password, user.password);

          if (!valid) {
            await loginRateLimiter?.recordFailure(email, ip);
            return null;
          }

          await loginRateLimiter?.clear(email, ip);

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
