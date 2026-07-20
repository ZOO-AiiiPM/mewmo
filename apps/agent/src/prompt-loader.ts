import { readFile } from "node:fs/promises";

export async function loadAgentPrompt(skill: "general" | "deep-insight") {
  const system = await readFile(new URL("../prompts/system.zh.md", import.meta.url), "utf8");
  if (skill === "general") return system.trim();
  const skillPrompt = await readFile(new URL("../prompts/skills/deep-insight.zh.md", import.meta.url), "utf8");
  return `${system.trim()}\n\n${skillPrompt.trim()}`;
}
