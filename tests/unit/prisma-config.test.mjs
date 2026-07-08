import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prismaConfig = readFileSync("packages/db/prisma.config.ts", "utf8");
const dbClient = readFileSync("packages/db/src/client.ts", "utf8");

test("Prisma CLI config uses the same local database as the web runtime", () => {
  assert.match(
    prismaConfig,
    /apps\/web\/\.env\.local/,
    "Prisma CLI should load the app env file used by next dev",
  );
  assert.match(
    prismaConfig,
    /localhost:15432\/mewmo_dev/,
    "Prisma CLI fallback should match the runtime fallback database",
  );
  assert.match(
    dbClient,
    /localhost:15432\/mewmo_dev/,
    "runtime fallback should stay on the local Docker database",
  );
});
