import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getPrisma } from "../packages/db/src/client";
import { backfillExternalTitles } from "./external-title-backfill";

async function main() {
  const rootEnv = fileURLToPath(new URL("../.env.local", import.meta.url));
  const webEnv = fileURLToPath(new URL("../apps/web/.env.local", import.meta.url));
  if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

  const apply = process.argv.includes("--apply");
  const prisma = getPrisma();

  try {
    const report = await backfillExternalTitles(prisma, { apply });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
