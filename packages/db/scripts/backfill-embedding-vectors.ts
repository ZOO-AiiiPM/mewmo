import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// 手动加载本机配置（与其它 db 脚本一致）。
const rootEnv = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const webEnv = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to backfill embedding vectors");

const dimensions = Number.parseInt(process.env.AI_EMBEDDING_DIMENSIONS ?? "1536", 10);
const batchSize = Number.parseInt(process.env.BACKFILL_BATCH_SIZE ?? "200", 10);

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

interface Row {
  id: string;
  embedding: unknown;
  dimensions: number;
}

function toVector(value: unknown, expectedDim: number): string | null {
  if (!Array.isArray(value)) return null;
  if (value.length !== expectedDim) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return `[${value.join(",")}]`;
}

async function main() {
  let processed = 0;
  let written = 0;
  let skipped = 0;
  let cursor: string | null = null;

  // 幂等 + 可恢复：只处理 embedding_vector 仍为空的行，按 id 游标分批。
  // 中断后重跑会从剩余的空向量行继续，不重复写入已回填的数据。
  for (;;) {
    const rows: Row[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "embedding", "dimensions"
       FROM "content_embeddings"
       WHERE "embedding_vector" IS NULL
         AND ($1::text IS NULL OR "id" > $1)
       ORDER BY "id" ASC
       LIMIT $2`,
      cursor,
      batchSize,
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      cursor = row.id;
      processed += 1;
      // 识别并跳过维度不一致（模型/版本变化）的历史向量，等待重新生成。
      const literal = row.dimensions === dimensions ? toVector(row.embedding, dimensions) : null;
      if (!literal) {
        skipped += 1;
        continue;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "content_embeddings" SET "embedding_vector" = $1::vector WHERE "id" = $2`,
        literal,
        row.id,
      );
      written += 1;
    }

    // eslint-disable-next-line no-console
    console.log(`[backfill-embedding-vectors] processed=${processed} written=${written} skipped=${skipped}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill-embedding-vectors] done processed=${processed} written=${written} skipped=${skipped} (dimensions=${dimensions})`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
