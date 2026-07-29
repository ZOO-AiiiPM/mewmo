import { readFile } from "node:fs/promises";

type PromptManifest = Record<string, { name: string; version: number }>;

let manifestPromise: Promise<PromptManifest> | undefined;

export async function loadWorkflowPromptLink(id: string) {
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
