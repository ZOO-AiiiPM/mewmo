import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const rootEnv = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const webEnv = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to ensure the development schema");

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

try {
  // Additive and idempotent: shared development databases may contain tables from
  // another active branch, so a full db:push could attempt to drop valid data.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "feeds"
    ADD COLUMN IF NOT EXISTS "last_seen_entry_url" TEXT
  `);
} finally {
  await prisma.$disconnect();
}
