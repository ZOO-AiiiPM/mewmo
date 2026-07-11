import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("project testing SOP selects evidence by change and preserves the release gate", () => {
  const sop = readFileSync("docs/testing-sop.md", "utf8");
  assert.match(sop, /按改动影响面选择验证/);
  assert.match(sop, /pnpm test:unit/);
  assert.match(sop, /pnpm test:integration/);
  assert.match(sop, /pnpm test:theme/);
  assert.match(sop, /断言.*需求|需求.*断言/);
  assert.match(sop, /稳定生产别名/);
  assert.match(sop, /Vercel.*Ready/);
});

test("CI gives the theme scanner an explicit comparison base", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /THEME_COLOR_BASE_SHA/);
  assert.match(workflow, /pull_request\.base\.sha/);
  assert.match(workflow, /github\.event\.before/);
});
