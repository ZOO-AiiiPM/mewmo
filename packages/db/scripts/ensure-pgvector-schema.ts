import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma CLI/脚本不自动读取 .env.local，这里手动加载本机配置。
const rootEnv = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const webEnv = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to ensure the pgvector schema");

// 向量维度必须与 schema.prisma 中 Unsupported("vector(N)") 保持一致。
// 默认 1536（多数 embedding 模型的常见维度）；如需变更请同步修改 schema 与本值。
const dimensions = Number.parseInt(process.env.AI_EMBEDDING_DIMENSIONS ?? "1536", 10);
if (!Number.isInteger(dimensions) || dimensions <= 0) {
  throw new Error(`AI_EMBEDDING_DIMENSIONS must be a positive integer, received: ${process.env.AI_EMBEDDING_DIMENSIONS}`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

try {
  // 全部语句均幂等（IF NOT EXISTS），可在共享/已存在的库上反复安全执行。

  // 1) 启用扩展。pgvector 需要 `pgvector/pgvector` 镜像；pg_trgm 为标准 contrib。
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // 2) 向量影子列（若 db push 已建则为 no-op）。
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "content_embeddings" ADD COLUMN IF NOT EXISTS "embedding_vector" vector(${dimensions})`,
  );

  // 3) Dense 语义召回索引：HNSW + 余弦距离。
  //    HNSW 在任意数据规模均可用，未命中时优雅回退顺序扫描。
  //    m / ef_construction 为默认级别，数据量增大后可按需调参。
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "content_embeddings_embedding_vector_hnsw"
     ON "content_embeddings" USING hnsw ("embedding_vector" vector_cosine_ops)
     WITH (m = 16, ef_construction = 64)`,
  );

  // 4) Lexical 词面召回索引：pg_trgm GIN（中文按字符三元组）。
  for (const table of ["notes", "clips", "feed_entries"]) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${table}_title_trgm"
       ON "${table}" USING gin ("title" gin_trgm_ops)`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${table}_content_trgm"
       ON "${table}" USING gin ("content" gin_trgm_ops)`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[ensure-pgvector-schema] ok (vector dimensions=${dimensions})`);
} finally {
  await prisma.$disconnect();
}
