import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";

const examples = [
  "apps/web/.env.local.example",
  "apps/agent/.env.local.example",
  "apps/ai-workflows/.env.local.example",
];
const read = (path) => readFileSync(path, "utf8");

test("local runtimes load only their app-owned env", () => {
  const agent = JSON.parse(read("apps/agent/package.json"));
  const workflow = JSON.parse(read("apps/ai-workflows/package.json"));

  assert.equal(agent.scripts.dev, "node --env-file=.env.local --import tsx --watch src/index.ts");
  assert.equal(agent.scripts["start:local"], "node --env-file=.env.local --import tsx src/index.ts");
  assert.equal(
    agent.scripts["cron:automations:local"],
    "node --env-file=.env.local --import tsx src/commands/run-automations.ts",
  );
  assert.equal(
    workflow.scripts["cron:ai:local"],
    "node --env-file=.env.local --import tsx src/commands/run-due.ts",
  );

  for (const command of [agent.scripts.start, agent.scripts["cron:automations"], workflow.scripts["cron:ai"]]) {
    assert.doesNotMatch(command, /env-file|\.env\.local/);
  }
});

test("runtime and maintenance sources do not load repository-root env", () => {
  const tracked = execFileSync("git", ["ls-files", "apps", "packages", "tooling"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((path) => [".js", ".mjs", ".ts", ".tsx"].includes(extname(path)));
  const rootEnvLoader = /new URL\(["'](?:\.\.\/)+\.env(?:\.workflow)?\.local["']/;

  for (const path of tracked) {
    assert.doesNotMatch(read(path), rootEnvLoader, path);
  }
});

test("app-local files are ignored and tracked examples contain no credentials", () => {
  const sensitive = /^(?:DATABASE_URL|REDIS_URL|.*(?:API_KEY|ACCESS_KEY|SECRET|CLIENT_ID|AUTH_TOKEN|DSN))$/;
  const dockerignore = read(".dockerignore");
  assert.match(dockerignore, /^\*\*\/\.env\*$/m);

  for (const example of examples) {
    const localFile = example.replace(/\.example$/, "");
    const ignoredBy = execFileSync("git", ["check-ignore", "-v", localFile], { encoding: "utf8" });
    assert.match(ignoredBy, /\.env\*\.local/);

    const source = read(example);
    for (const [key, value] of envEntries(source)) {
      if (sensitive.test(key)) assert.equal(value, "", `${example}: ${key} must stay empty`);
    }
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\/[^\s]*@/);
  }
});

function envEntries(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    });
}
