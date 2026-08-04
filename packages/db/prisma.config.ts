import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma CLI 不像 Next.js 那样自动读 app-local env；本地 DB 工具归属 Web runtime。
// 用 fileURLToPath 而非 .pathname：路径含中文时 .pathname 会 percent-encode 导致 existsSync 失败
const webEnv = fileURLToPath(new URL("../../apps/web/.env.local", import.meta.url));
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
