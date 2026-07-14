import { z } from "zod";

const r2RequiredEnvKeys = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

const qiniuRequiredEnvKeys = [
  "QINIU_ACCESS_KEY",
  "QINIU_SECRET_KEY",
  "QINIU_BUCKET",
  "QINIU_PUBLIC_BASE_URL",
] as const;

type RequiredAIEnvKey =
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "CUSTOM_AI_API_KEY"
  | "CUSTOM_AI_BASE_URL";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const redisEnvSchema = z.object({
  REDIS_URL: z.string().min(1),
});

const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    NEXTAUTH_URL: optionalUrl,
    FEED_REFRESH_BASE_URL: optionalUrl,
    FEED_CRON_SECRET: optionalNonEmptyString,
    AI_PROVIDER: z.enum(["openai", "anthropic", "custom"]).optional(),
    OPENAI_API_KEY: optionalNonEmptyString,
    OPENAI_BASE_URL: optionalUrl,
    ANTHROPIC_API_KEY: optionalNonEmptyString,
    ANTHROPIC_BASE_URL: optionalUrl,
    CUSTOM_AI_API_KEY: optionalNonEmptyString,
    CUSTOM_AI_BASE_URL: optionalUrl,
    AI_SUMMARY_MODEL: optionalNonEmptyString,
  })
  .superRefine((env, ctx) => {
    if (!env.FEED_REFRESH_BASE_URL && !env.NEXTAUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["FEED_REFRESH_BASE_URL"],
        message: "FEED_REFRESH_BASE_URL or NEXTAUTH_URL is required for the Worker",
      });
    }

    if (!env.AI_SUMMARY_MODEL) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_SUMMARY_MODEL"],
        message: "AI_SUMMARY_MODEL is required for the Worker",
      });
    }

    if (env.NODE_ENV === "production" && !env.FEED_CRON_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["FEED_CRON_SECRET"],
        message: "FEED_CRON_SECRET is required for the production Worker",
      });
    }

    const aiProvider = env.AI_PROVIDER ?? "openai";
    const requiredAIKeys: RequiredAIEnvKey[] =
      aiProvider === "anthropic"
        ? ["ANTHROPIC_API_KEY"]
        : aiProvider === "custom"
          ? ["CUSTOM_AI_API_KEY", "CUSTOM_AI_BASE_URL"]
          : ["OPENAI_API_KEY"];

    for (const key of requiredAIKeys) {
      if (env[key]) continue;
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required for the configured AI provider`,
      });
    }
  })
  .transform((env) => ({
    ...env,
    FEED_REFRESH_BASE_URL: env.FEED_REFRESH_BASE_URL ?? env.NEXTAUTH_URL!,
  }));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  AI_PROVIDER: z.enum(["openai", "anthropic", "custom"]).optional(),
  OPENAI_API_KEY: optionalNonEmptyString,
  OPENAI_BASE_URL: optionalUrl,
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  ANTHROPIC_BASE_URL: optionalUrl,
  CUSTOM_AI_API_KEY: optionalNonEmptyString,
  CUSTOM_AI_BASE_URL: optionalUrl,
  AI_SUMMARY_MODEL: optionalNonEmptyString,
  AI_CHAT_MODEL: optionalNonEmptyString,
  AI_TAG_MODEL: optionalNonEmptyString,
  AI_EMBEDDING_MODEL: optionalNonEmptyString,
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY: z.string().min(1).optional(),
  R2_SECRET_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  STORAGE_PROVIDER: z.enum(["r2", "qiniu"]).optional(),
  QINIU_ACCESS_KEY: z.string().min(1).optional(),
  QINIU_SECRET_KEY: z.string().min(1).optional(),
  QINIU_BUCKET: z.string().min(1).optional(),
  QINIU_PUBLIC_BASE_URL: z.string().url().optional(),
  QINIU_UPLOAD_ENDPOINT: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  FEED_SEARCH_ENDPOINT: z.string().url().optional(),
  FEED_SEARCH_API_KEY: z.string().min(1).optional(),
  FEED_REFRESH_BASE_URL: z.string().url().optional(),
  FEED_CRON_SECRET: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  const aiProvider = env.AI_PROVIDER ?? "openai";
  const requiredAIKeys: RequiredAIEnvKey[] =
    aiProvider === "anthropic"
      ? ["ANTHROPIC_API_KEY"]
      : aiProvider === "custom"
        ? ["CUSTOM_AI_API_KEY", "CUSTOM_AI_BASE_URL"]
        : ["OPENAI_API_KEY"];

  for (const key of requiredAIKeys) {
    if (env[key]) continue;
    ctx.addIssue({
      code: "custom",
      path: [key],
      message: `${key} is required for the configured AI provider`,
    });
  }

  const requiredStorageKeys = env.STORAGE_PROVIDER === "qiniu" ? qiniuRequiredEnvKeys : r2RequiredEnvKeys;

  for (const key of requiredStorageKeys) {
    if (env[key]) continue;
    ctx.addIssue({
      code: "custom",
      path: [key],
      message: `${key} is required for the configured storage provider`,
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadEnv(input: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }

  return parsed.data;
}

export function loadRedisEnv(input: Record<string, string | undefined> = process.env): RedisEnv {
  const parsed = redisEnvSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid Redis environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }

  return parsed.data;
}

export function loadWorkerEnv(input: Record<string, string | undefined> = process.env): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid Worker environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }

  return parsed.data;
}
