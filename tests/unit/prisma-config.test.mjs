import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prismaConfig = readFileSync("packages/db/prisma.config.ts", "utf8");
const dbClient = readFileSync("packages/db/src/client.ts", "utf8");
const dbPackage = JSON.parse(readFileSync("packages/db/package.json", "utf8"));
const turboConfig = JSON.parse(readFileSync("turbo.json", "utf8"));

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

test("db package build generates Prisma Client before TypeScript compilation", () => {
  assert.match(
    dbPackage.scripts.build,
    /prisma generate\s*&&\s*tsc -p tsconfig\.json/,
    "cloud builds should not rely on a manually generated local Prisma Client",
  );
});

test("db package build never restores an external Prisma Client from Turbo cache", () => {
  assert.equal(
    turboConfig.tasks["@mewmo/db#build"]?.cache,
    false,
    "Prisma generates into workspace node_modules, so every cloud build must regenerate it",
  );
});
