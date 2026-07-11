import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const forbidden = [
  /\bcolor\s*:\s*(?:#(?:fff|ffffff|000|000000)\b|white\b|black\b|rgb\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*\))/i,
  /\b(?:text-white|text-black)\b/,
];

function validateAllowlist(allowlist) {
  for (const entry of allowlist) {
    if (!entry.path || !entry.pattern || !entry.reason?.trim()) {
      throw new Error("Theme color allowlist entries require path, pattern, and reason");
    }
    if (["#fff", "#ffffff", "white", "black", "text-white", "text-black"].includes(entry.pattern)) {
      throw new Error(`Theme color allowlist pattern is too broad: ${entry.pattern}`);
    }
  }
}

function isAllowed(path, source, allowlist) {
  return allowlist.some(
    (entry) => entry.path === path && source.includes(entry.pattern),
  );
}

export function findThemeColorViolations(path, addedLines, allowlist) {
  validateAllowlist(allowlist);
  const violations = [];
  for (const [index, rawLine] of addedLines.split("\n").entries()) {
    if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;
    const source = rawLine.slice(1);
    const rule = forbidden.find((pattern) => pattern.test(source));
    if (!rule || isAllowed(path, source, allowlist)) continue;
    violations.push({ path, line: index + 1, source: source.trim(), rule: rule.source });
  }
  return violations;
}

function gitDiff(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function diffSections(diff) {
  const sections = [];
  let currentPath = null;
  let currentLines = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      if (currentPath) sections.push({ path: currentPath, lines: currentLines.join("\n") });
      currentPath = line.slice(6);
      currentLines = [];
      continue;
    }
    if (line.startsWith("diff --git ")) continue;
    if (currentPath) currentLines.push(line);
  }
  if (currentPath) sections.push({ path: currentPath, lines: currentLines.join("\n") });
  return sections;
}

function runCli() {
  const allowlist = JSON.parse(
    readFileSync(new URL("./theme-color-allowlist.json", import.meta.url), "utf8"),
  );
  validateAllowlist(allowlist);

  const diffs = [
    process.env.THEME_COLOR_BASE_SHA
      ? gitDiff([
          "diff",
          "--unified=0",
          `${process.env.THEME_COLOR_BASE_SHA}...HEAD`,
          "--",
          "apps/web/src",
        ])
      : "",
    gitDiff(["diff", "--unified=0", "--", "apps/web/src"]),
    gitDiff(["diff", "--cached", "--unified=0", "--", "apps/web/src"]),
  ];
  const unique = new Map();
  for (const diff of diffs) {
    for (const section of diffSections(diff)) {
      for (const violation of findThemeColorViolations(
        section.path,
        section.lines,
        allowlist,
      )) {
        unique.set(`${violation.path}:${violation.source}`, violation);
      }
    }
  }

  if (unique.size === 0) return;
  console.error("Theme-dependent hard-coded colors found in added UI lines:");
  for (const violation of unique.values()) {
    console.error(`${violation.path}:${violation.line}: ${violation.source}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
