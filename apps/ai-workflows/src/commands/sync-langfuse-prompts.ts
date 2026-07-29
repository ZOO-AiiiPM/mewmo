import { createHash } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { LangfuseClient, type TextPromptClient } from "@langfuse/client";

import { parseWorkflowPrompt } from "../prompts";

export interface CodeOwnedPrompt {
  id: string;
  name: string;
  content: string;
  tags: string[];
  config: Record<string, unknown>;
}

interface PromptClientPort {
  prompt: {
    get(name: string, options: { label: string; type: "text"; cacheTtlSeconds: number; maxRetries: number; fetchTimeoutMs: number }): Promise<TextPromptClient>;
    create(input: { name: string; type: "text"; prompt: string; config: Record<string, unknown>; tags: string[]; labels: string[]; commitMessage: string }): Promise<TextPromptClient>;
    update(input: { name: string; version: number; newLabels: string[] }): Promise<unknown>;
  };
}

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const manifestPaths = [
  fileURLToPath(new URL("../../../agent/prompts/langfuse-manifest.json", import.meta.url)),
  fileURLToPath(new URL("../../prompts/langfuse-manifest.json", import.meta.url)),
];

export async function syncCodeOwnedPrompts(input: {
  client: PromptClientPort;
  prompts: CodeOwnedPrompt[];
  label: string;
  release: string;
}) {
  const manifest: Record<string, { name: string; version: number }> = {};
  for (const prompt of input.prompts) {
    const digest = promptDigest(prompt);
    const labeled = await getPrompt(input.client, prompt.name, input.label);
    let version: number;
    if (labeled && remoteDigest(labeled, prompt) === digest) {
      version = labeled.version;
    } else {
      const latest = await getPrompt(input.client, prompt.name, "latest");
      const promoted = latest && remoteDigest(latest, prompt) === digest
        ? latest
        : await input.client.prompt.create({
            name: prompt.name,
            type: "text",
            prompt: prompt.content,
            config: { ...prompt.config, digest },
            tags: prompt.tags,
            labels: [],
            commitMessage: `source=repository release=${input.release} digest=${digest}`,
          });
      await input.client.prompt.update({
        name: prompt.name,
        version: promoted.version,
        newLabels: [...new Set([...promoted.labels.filter((label) => label !== "latest"), input.label])],
      });
      version = promoted.version;
    }
    manifest[prompt.id] = { name: prompt.name, version };
  }
  return manifest;
}

export function promptDigest(prompt: CodeOwnedPrompt) {
  return createHash("sha256").update(stableJson({
    name: prompt.name,
    content: normalize(prompt.content),
    config: prompt.config,
    tags: [...prompt.tags].sort(),
  })).digest("hex");
}

async function getPrompt(client: PromptClientPort, name: string, label: string) {
  try {
    return await client.prompt.get(name, {
      label,
      type: "text",
      cacheTtlSeconds: 0,
      maxRetries: 2,
      fetchTimeoutMs: 5_000,
    });
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function remoteDigest(remote: TextPromptClient, prompt: CodeOwnedPrompt) {
  return promptDigest({
    ...prompt,
    content: remote.prompt,
    config: stripDigest(remote.config),
    tags: remote.tags,
  });
}

function stripDigest(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const { digest: _digest, ...config } = value;
  return config;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function normalize(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function isNotFound(error: unknown) {
  return isRecord(error) && (error.status === 404 || error.statusCode === 404);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadPrompts(): Promise<CodeOwnedPrompt[]> {
  const agentSystem = normalize(await readFile(new URL("../../../agent/prompts/system.zh.md", import.meta.url), "utf8"));
  const deepInsight = normalize(await readFile(new URL("../../../agent/prompts/skills/deep-insight.zh.md", import.meta.url), "utf8"));
  const workflowNames = ["article-summary.zh", "note-insight.zh", "summary-judge.zh"] as const;
  const workflows = await Promise.all(workflowNames.map(async (fileName) => {
    const loaded = parseWorkflowPrompt(await readFile(new URL(`../../prompts/${fileName}.md`, import.meta.url), "utf8"));
    return {
      id: loaded.metadata.id,
      name: loaded.metadata.id.replace(".", "/"),
      content: loaded.content,
      tags: ["mewmo", loaded.metadata.task.startsWith("eval.") ? "eval" : "workflow"],
      config: { source: "repository", task: loaded.metadata.task, sourceVersion: loaded.metadata.version, revision: loaded.metadata.revision },
    };
  }));
  return [
    { id: "agent/system.zh", name: "agent/system.zh", content: agentSystem, tags: ["mewmo", "agent"], config: { source: "repository" } },
    { id: "agent/skills/deep-insight.zh", name: "agent/skills/deep-insight.zh", content: deepInsight, tags: ["mewmo", "agent", "skill"], config: { source: "repository" } },
    ...workflows,
  ];
}

async function writeManifest(manifest: Record<string, { name: string; version: number }>) {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const replacements = manifestPaths.map((path) => ({
    path,
    temporary: `${path}.${process.pid}.tmp`,
  }));
  await Promise.all(replacements.map(({ temporary }) => writeFile(temporary, content, "utf8")));
  for (const replacement of replacements) await rename(replacement.temporary, replacement.path);
}

async function main() {
  const lockPath = `${repositoryRoot}.langfuse-prompt-sync.lock`;
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lock = await open(lockPath, "wx");
    const client = new LangfuseClient({
      publicKey: requiredEnv("LANGFUSE_PUBLIC_KEY"),
      secretKey: requiredEnv("LANGFUSE_SECRET_KEY"),
      ...(process.env.LANGFUSE_BASE_URL ? { baseUrl: process.env.LANGFUSE_BASE_URL } : {}),
    });
    const manifest = await syncCodeOwnedPrompts({
      client,
      prompts: await loadPrompts(),
      label: process.env.LANGFUSE_PROMPT_LABEL?.trim() || process.env.LANGFUSE_ENVIRONMENT?.trim() || "production",
      release: process.env.LANGFUSE_RELEASE?.trim() || process.env.GIT_COMMIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local",
    });
    await writeManifest(manifest);
    console.info(`[langfuse-prompt-sync] synchronized ${Object.keys(manifest).length} prompts.`);
  } catch {
    console.warn("[langfuse-prompt-sync] synchronization failed; existing runtime manifest was preserved.");
  } finally {
    await lock?.close().catch(() => undefined);
    if (lock) await unlink(lockPath).catch(() => undefined);
  }
}

function requiredEnv(name: "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  await main();
}
