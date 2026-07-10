import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootEnv = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const webEnv = fileURLToPath(new URL("../../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

const [{ getPrisma }, { cleanupPrototypeOnboarding }] = await Promise.all([
  import("../src/client"),
  import("../src/cleanup-prototype-onboarding"),
]);

const apply = process.argv.includes("--apply");
const prisma = getPrisma();

try {
  const report = await cleanupPrototypeOnboarding(prisma, { apply });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2));
} finally {
  await prisma.$disconnect();
}
