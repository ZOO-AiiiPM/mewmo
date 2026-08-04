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
  | "GEMINI_API_KEY"
  | "CUSTOM_AI_API_KEY"
  | "CUSTOM_AI_BASE_URL";

const aiProviderSchema = z.enum(["openai", "anthropic", "custom", "google"]);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const rerankEnvShape = {
  // ZOO-64: provider-neutral reranker. Unset AI_RERANK_API_KEY 降级为透传实现（保留 RRF 顺序）。
  AI_RERANK_PROVIDER: optionalNonEmptyString,
  AI_RERANK_MODEL: optionalNonEmptyString,
  AI_RERANK_API_KEY: optionalNonEmptyString,
  AI_RERANK_BASE_URL: optionalUrl,
  AI_RERANK_TIMEOUT_MS: optionalPositiveInt,
  AI_RERANK_MAX_CANDIDATES: optionalPositiveInt,
  // provider=jina 时的密钥来源（与 ZOO-65 Jina 工具共享）；AI_RERANK_API_KEY 未设时回退到此。
  JINA_API_KEY: optionalNonEmptyString,
  // 固定 pgvector 列维度，默认 1536；与 ensure-pgvector-schema.ts / backfill 一致。
  AI_EMBEDDING_DIMENSIONS: optionalPositiveInt,
} as const;

const redisEnvSchema = z.object({
  REDIS_URL: z.string().min(1),
});

const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    AI_PROVIDER: aiProviderSchema.optional(),
    OPENAI_API_KEY: optionalNonEmptyString,
    OPENAI_BASE_URL: optionalUrl,
    ANTHROPIC_API_KEY: optionalNonEmptyString,
    ANTHROPIC_BASE_URL: optionalUrl,
    GEMINI_API_KEY: optionalNonEmptyString,
    GEMINI_BASE_URL: optionalUrl,
    CUSTOM_AI_API_KEY: optionalNonEmptyString,
    CUSTOM_AI_BASE_URL: optionalUrl,
    AI_SUMMARY_MODEL: optionalNonEmptyString,
    ...rerankEnvShape,
  })
  .superRefine((env, ctx) => {
    if (!env.AI_SUMMARY_MODEL) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_SUMMARY_MODEL"],
        message: "AI_SUMMARY_MODEL is required for the Worker",
      });
    }

    const requiredAIKeys = requiredAIKeysFor(env.AI_PROVIDER);

    for (const key of requiredAIKeys) {
      if (env[key]) continue;
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required for the configured AI provider`,
      });
    }
  });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  AI_PROVIDER: aiProviderSchema.optional(),
  OPENAI_API_KEY: optionalNonEmptyString,
  OPENAI_BASE_URL: optionalUrl,
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  ANTHROPIC_BASE_URL: optionalUrl,
  GEMINI_API_KEY: optionalNonEmptyString,
  GEMINI_BASE_URL: optionalUrl,
  CUSTOM_AI_API_KEY: optionalNonEmptyString,
  CUSTOM_AI_BASE_URL: optionalUrl,
  AI_SUMMARY_MODEL: optionalNonEmptyString,
  AI_CHAT_MODEL: optionalNonEmptyString,
  AI_TAG_MODEL: optionalNonEmptyString,
  AI_EMBEDDING_MODEL: optionalNonEmptyString,
  R2_ENDPOINT: optionalUrl,
  R2_ACCESS_KEY: optionalNonEmptyString,
  R2_SECRET_KEY: optionalNonEmptyString,
  R2_BUCKET: optionalNonEmptyString,
  R2_PUBLIC_BASE_URL: optionalUrl,
  STORAGE_PROVIDER: z.enum(["r2", "qiniu"]).optional(),
  QINIU_ACCESS_KEY: optionalNonEmptyString,
  QINIU_SECRET_KEY: optionalNonEmptyString,
  QINIU_BUCKET: optionalNonEmptyString,
  QINIU_PUBLIC_BASE_URL: optionalUrl,
  QINIU_UPLOAD_ENDPOINT: optionalUrl,
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  FEED_SEARCH_ENDPOINT: optionalUrl,
  FEED_SEARCH_API_KEY: optionalNonEmptyString,
  ...rerankEnvShape,
}).superRefine((env, ctx) => {
  const requiredAIKeys = requiredAIKeysFor(env.AI_PROVIDER);

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

function requiredAIKeysFor(provider: z.infer<typeof aiProviderSchema> | undefined): RequiredAIEnvKey[] {
  if (provider === "anthropic") return ["ANTHROPIC_API_KEY"];
  if (provider === "custom") return ["CUSTOM_AI_API_KEY", "CUSTOM_AI_BASE_URL"];
  if (provider === "google") return ["GEMINI_API_KEY"];
  return ["OPENAI_API_KEY"];
}

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
