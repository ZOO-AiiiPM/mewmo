import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const webPort = process.env.API_TEST_PORT ?? "3100";
const fixturePort = process.env.API_TEST_FIXTURE_PORT ?? "3101";
const postgresPort = process.env.API_TEST_POSTGRES_PORT ?? "55432";
const redisPort = process.env.API_TEST_REDIS_PORT ?? "56379";
const resourcePrefix = `mewmo-integration-${process.pid}`;
const postgresContainer = `${resourcePrefix}-postgres`;
const redisContainer = `${resourcePrefix}-redis`;
const nextDistDir = `.next-integration-${process.pid}`;
const nextEnvPath = new URL("../apps/web/next-env.d.ts", import.meta.url);
const originalNextEnv = readFileSync(nextEnvPath, "utf8");
const email = `integration-${randomUUID()}@mewmo.test`;
const password = "integration-test-password";
const baseUrl = `http://127.0.0.1:${webPort}`;
const fixtureUrl = `http://127.0.0.1:${fixturePort}/article`;
const fixtureOrigin = new URL(fixtureUrl).origin;
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.API_TEST_DATABASE_URL ??
    `postgresql://mewmo:mewmo@localhost:${postgresPort}/mewmo_dev?schema=public`,
  REDIS_URL: process.env.API_TEST_REDIS_URL ?? `redis://localhost:${redisPort}`,
  POSTGRES_PORT: postgresPort,
  REDIS_PORT: redisPort,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "integration-test-secret",
  NEXTAUTH_URL: baseUrl,
  NEXT_DIST_DIR: nextDistDir,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "integration-google-client",
  GOOGLE_CLIENT_SECRET:
    process.env.GOOGLE_CLIENT_SECRET ?? "integration-google-secret",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "integration-openai-key",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? `${fixtureOrigin}/v1`,
  AI_SUMMARY_MODEL: process.env.AI_SUMMARY_MODEL ?? "integration-summary-model",
  R2_ENDPOINT:
    process.env.R2_ENDPOINT ?? "https://integration.r2.cloudflarestorage.com",
  R2_ACCESS_KEY: process.env.R2_ACCESS_KEY ?? "integration-r2-access",
  R2_SECRET_KEY: process.env.R2_SECRET_KEY ?? "integration-r2-secret",
  R2_BUCKET: process.env.R2_BUCKET ?? "integration-bucket",
  R2_PUBLIC_BASE_URL:
    process.env.R2_PUBLIC_BASE_URL ?? "https://cdn.integration.mewmo.test",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "integration-resend-key",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "Mewmo <integration@mewmo.test>",
  API_TEST_BASE_URL: baseUrl,
  API_TEST_ARTICLE_URL: fixtureUrl,
  API_TEST_EMAIL: email,
  API_TEST_PASSWORD: password,
};

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    ...options,
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout);
      else {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function waitForContainerHealthy(name, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = (
      await runCapture("docker", [
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        name,
      ])
    ).trim();
    if (status === "healthy") return;
    if (status === "unhealthy") {
      throw new Error(`Integration container ${name} became unhealthy`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for integration container ${name}`);
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startFixtureServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", fixtureUrl);
    const respond = () => {
      if (url.pathname === "/v1/chat/completions") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ choices: [{ message: { content: "Integration Mewmo AI summary" } }] }));
        return;
      }
      if (url.searchParams.has("rss")) {
        if (url.searchParams.get("fail") === "1") {
          response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
          response.end("fixture feed unavailable");
          return;
        }
        const itemCount = Math.min(Math.max(Number.parseInt(url.searchParams.get("items") ?? "1", 10) || 1, 1), 60);
        const start = Math.max(Number.parseInt(url.searchParams.get("start") ?? "1", 10) || 1, 1);
        const items = Array.from({ length: itemCount }, (_, index) => {
          const articleNumber = start + index;
          const suffix = index === 0 ? "" : ` ${index + 1}`;
          return `<item><title>Fixture Entry${suffix}</title><link>${fixtureUrl}?article=${articleNumber}</link><guid>fixture-entry-${articleNumber}</guid><description>Fixture body ${articleNumber}</description></item>`;
        }).join("");
        response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
        response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Integration Feed</title><link>${fixtureUrl}</link><description>Fixture</description>${items}</channel></rss>`);
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><head><title>Example Article</title></head><body><article><p>Readable body</p></article></body></html>");
    };
    const delayMs = Math.min(Number.parseInt(url.searchParams.get("delay") ?? "0", 10) || 0, 1_000);
    if (delayMs > 0) setTimeout(respond, delayMs);
    else respond();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(fixturePort), "127.0.0.1", () => resolve(server));
  });
}

async function registerTestUser() {
  const response = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Integration Test" }),
  });
  if (response.status !== 201) {
    throw new Error(`Test account registration returned ${response.status}`);
  }
}

async function cleanupTestUser() {
  const { getPrisma } = await import("../packages/db/src/client.ts");
  await getPrisma().user.deleteMany({ where: { email } });
  await getPrisma().$disconnect();
}

async function stopOwnedProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function removeNextOutput() {
  const output = new URL(`../apps/web/${nextDistDir}`, import.meta.url);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(output, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== "ENOTEMPTY" || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function main() {
  let fixtureServer;
  let web;
  let accountCreated = false;
  try {
    await run("docker", [
      "run",
      "--detach",
      "--name",
      postgresContainer,
      "--publish",
      `127.0.0.1:${postgresPort}:5432`,
      "--env",
      "POSTGRES_USER=mewmo",
      "--env",
      "POSTGRES_PASSWORD=mewmo",
      "--env",
      "POSTGRES_DB=mewmo_dev",
      "--health-cmd",
      "pg_isready -U mewmo -d mewmo_dev",
      "--health-interval",
      "1s",
      "--health-timeout",
      "5s",
      "--health-retries",
      "30",
      "postgres:15",
    ]);
    await run("docker", [
      "run",
      "--detach",
      "--name",
      redisContainer,
      "--publish",
      `127.0.0.1:${redisPort}:6379`,
      "--health-cmd",
      "redis-cli ping",
      "--health-interval",
      "1s",
      "--health-timeout",
      "5s",
      "--health-retries",
      "30",
      "redis:7",
    ]);
    await Promise.all([
      waitForContainerHealthy(postgresContainer),
      waitForContainerHealthy(redisContainer),
    ]);
    await run("pnpm", ["db:generate"]);
    await run("pnpm", ["db:push"]); // pnpm db:push
    fixtureServer = await startFixtureServer();
    web = spawnCommand(
      "pnpm",
      ["--filter", "@mewmo/web", "dev", "--hostname", "127.0.0.1", "--port", webPort],
      { detached: true },
    ); // pnpm --filter @mewmo/web dev
    await waitForHttp(`${baseUrl}/login`);
    await registerTestUser();
    accountCreated = true;
    await run("pnpm", ["exec", "tsx", "--test", "tests/integration/*.test.mjs"]);
  } finally {
    if (accountCreated) {
      await cleanupTestUser().catch((error) => {
        console.error("Failed to clean integration test user", error);
      });
    }
    await stopOwnedProcess(web).catch((error) => {
      console.error("Failed to stop integration Web process", error);
    });
    if (fixtureServer) {
      await new Promise((resolve) => fixtureServer.close(resolve)).catch((error) => {
        console.error("Failed to stop integration fixture server", error);
      });
    }
    await removeNextOutput().catch((error) => {
      console.error("Failed to remove integration Next output", error);
    });
    writeFileSync(nextEnvPath, originalNextEnv);
    await Promise.all(
      [postgresContainer, redisContainer].map((container) =>
        run("docker", ["rm", "--force", "--volumes", container]).catch((error) => {
          console.error(`Failed to remove integration container ${container}`, error);
        }),
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
