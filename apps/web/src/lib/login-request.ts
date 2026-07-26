import { AuthError, isLoginRateLimitError } from "@mewmo/auth";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequestBody = z.infer<typeof bodySchema>;

export function parseLoginBody(raw: unknown): LoginRequestBody | null {
  const parsed = bodySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface LoginFailureResponse {
  status: 401 | 429;
  error: string;
}

/**
 * signIn 抛错 → HTTP 语义映射：限速 429、凭证错误 401。
 * 返回 null 表示不是登录语义内的错误，调用方应继续上抛（保持 500 可观测）。
 */
export function mapLoginError(error: unknown): LoginFailureResponse | null {
  if (isLoginRateLimitError(error)) {
    return { status: 429, error: "尝试次数过多，请 10 分钟后再试" };
  }
  if (error instanceof AuthError) {
    return { status: 401, error: "Invalid email or password" };
  }
  return null;
}
