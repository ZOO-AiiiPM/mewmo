import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma CLI 不像 Next.js 那样自动读 .env.local，手动加载本机配置
// 用 fileURLToPath 而非 .pathname：路径含中文时 .pathname 会 percent-encode 导致 existsSync 失败
const rootEnv = fileURLToPath(new URL("../../.env.local", import.meta.url));
const webEnv = fileURLToPath(new URL("../../apps/web/.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (!process.env.DATABASE_URL && existsSync(webEnv)) process.loadEnvFile(webEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://mewmo:mewmo@localhost:15432/mewmo_dev?schema=public",
  },
});
