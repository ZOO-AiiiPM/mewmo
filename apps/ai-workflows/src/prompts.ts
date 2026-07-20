import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { LoadedPrompt } from "./contracts";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export async function loadWorkflowPrompt(
  name: "article-summary.zh" | "note-insight.zh" | "summary-judge.zh",
): Promise<LoadedPrompt> {
  const url = new URL(`../prompts/${name}.md`, import.meta.url);
  return parseWorkflowPrompt(await readFile(url, "utf8"));
}

export function parseWorkflowPrompt(source: string): LoadedPrompt {
  const match = FRONTMATTER.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("Prompt frontmatter is required");

  const fields = Object.fromEntries(
    (match[1] ?? "")
      .split("\n")
      .map((line) => line.split(/:(.*)/s).slice(0, 2).map((part) => part.trim()))
      .filter(([key, value]) => Boolean(key && value)),
  );
  const id = fields.id;
  const task = fields.task;
  const version = Number(fields.version);
  if (!id || !task || !Number.isInteger(version) || version < 1) {
    throw new Error("Prompt frontmatter requires id, task, and a positive integer version");
  }

  const content = (match[2] ?? "").trim();
  if (!content) throw new Error("Prompt content is required");
  return {
    metadata: {
      id,
      task,
      version,
      revision: createHash("sha256").update(source).digest("hex").slice(0, 16),
    },
    content,
  };
}
