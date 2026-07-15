import { readFile } from "node:fs/promises";

export async function loadPrompt(id: string) {
  const promptPath = new URL(`../prompts/${id}.md`, import.meta.url);
  const raw = await readFile(promptPath, "utf8");
  return stripFrontmatter(raw).trim();
}

function stripFrontmatter(raw: string) {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  return end >= 0 ? raw.slice(end + 4) : raw;
}
