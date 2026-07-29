import { readFile } from "node:fs/promises";

import type { ManagedPromptLink } from "./observability/port";

type PromptManifest = Record<string, { name: string; version: number }>;

let manifestPromise: Promise<PromptManifest> | undefined;

export async function loadAgentPromptLink(id: string): Promise<ManagedPromptLink | undefined> {
  try {
    const manifest = await (manifestPromise ??= readManifest());
    const prompt = manifest[id];
    return prompt ? { ...prompt, isFallback: false } : undefined;
  } catch {
    return undefined;
  }
}

async function readManifest(): Promise<PromptManifest> {
  const source = await readFile(new URL("../prompts/langfuse-manifest.json", import.meta.url), "utf8");
  return JSON.parse(source) as PromptManifest;
}
